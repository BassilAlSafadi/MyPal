using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using MyPal.Infrastructure.Data.Entities;

namespace MyPal.API.Services;

public interface IJwtService
{
    string GenerateAccessToken(User user);
    string GenerateRefreshToken(User user);
    ClaimsPrincipal? ValidateRefreshToken(string token);
    ClaimsPrincipal? GetPrincipalFromExpiredToken(string token);
}

public class JwtService : IJwtService
{
    private readonly IConfiguration _config;

    public JwtService(IConfiguration config)
    {
        _config = config;
    }

    public string GenerateAccessToken(User user)
    {
        var jwtSettings = _config.GetSection("JwtSettings");
        var secret = _config["JWT_SECRET"] ?? throw new InvalidOperationException("JWT_SECRET is missing");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            // NOTE: JwtRegisteredClaimNames.Email already serializes to the "email" claim.
            // Do NOT add a second new Claim("email", ...) — duplicate claims serialize as a
            // JSON array, which breaks the Go gateway's string `email` claim unmarshal (401).
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim("roles", string.Join(",", user.Roles)),
            // Emit as JSON booleans (ClaimValueTypes.Boolean), not strings — the Go gateway
            // unmarshals is_buyer/is_seller into Go `bool`, which rejects "true"/"false" strings.
            new Claim("is_buyer", user.IsBuyer ? "true" : "false", ClaimValueTypes.Boolean),
            new Claim("is_seller", user.IsSeller ? "true" : "false", ClaimValueTypes.Boolean)
        };

        var token = new JwtSecurityToken(
            issuer: _config["JWT_ISSUER"],
            audience: _config["JWT_AUDIENCE"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(double.Parse(_config["JWT_EXPIRY_MINUTES"] ?? "15")),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRefreshToken(User user)
    {
        var secret = _config["JWT_REFRESH_SECRET"] ?? _config["JWT_SECRET"] ?? throw new InvalidOperationException("JWT_SECRET is missing");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim("token_type", "refresh")
        };

        var token = new JwtSecurityToken(
            issuer: _config["JWT_ISSUER"],
            audience: _config["JWT_AUDIENCE"],
            claims: claims,
            expires: DateTime.UtcNow.Add(ParseRefreshLifetime()),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public ClaimsPrincipal? ValidateRefreshToken(string token)
    {
        var secret = _config["JWT_REFRESH_SECRET"] ?? _config["JWT_SECRET"];
        var tokenValidationParameters = new TokenValidationParameters
        {
            ValidateAudience = false,
            ValidateIssuer = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret!)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var principal = tokenHandler.ValidateToken(token, tokenValidationParameters, out SecurityToken securityToken);
        if (securityToken is not JwtSecurityToken jwtSecurityToken || !jwtSecurityToken.Header.Alg.Equals(SecurityAlgorithms.HmacSha256, StringComparison.InvariantCultureIgnoreCase))
            throw new SecurityTokenException("Invalid token");

        var tokenType = principal.FindFirstValue("token_type");
        if (tokenType != "refresh")
            throw new SecurityTokenException("Invalid token type");

        return principal;
    }

    public ClaimsPrincipal? GetPrincipalFromExpiredToken(string token)
    {
        var secret = _config["JWT_SECRET"];
        var tokenValidationParameters = new TokenValidationParameters
        {
            ValidateAudience = false,
            ValidateIssuer = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret!)),
            ValidateLifetime = false
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var principal = tokenHandler.ValidateToken(token, tokenValidationParameters, out SecurityToken securityToken);
        if (securityToken is not JwtSecurityToken jwtSecurityToken || !jwtSecurityToken.Header.Alg.Equals(SecurityAlgorithms.HmacSha256, StringComparison.InvariantCultureIgnoreCase))
            throw new SecurityTokenException("Invalid token");

        return principal;
    }

    private TimeSpan ParseRefreshLifetime()
    {
        // Product requirement: users should not have to sign in again unless
        // they explicitly log out. Refresh tokens are rotated on every refresh,
        // so active sessions keep extending; this default mainly covers long
        // gaps between visits.
        var raw = _config["JWT_REFRESH_EXPIRY"] ?? _config["JWT_REFRESH_EXPIRY_MINUTES"] ?? "3650d";
        raw = raw.Trim().ToLowerInvariant();

        TimeSpan parsed;
        if (raw.EndsWith("d") && double.TryParse(raw[..^1], out var days))
            parsed = TimeSpan.FromDays(days);
        else if (raw.EndsWith("h") && double.TryParse(raw[..^1], out var hours))
            parsed = TimeSpan.FromHours(hours);
        else if (raw.EndsWith("m") && double.TryParse(raw[..^1], out var minutes))
            parsed = TimeSpan.FromMinutes(minutes);
        else if (double.TryParse(raw, out var rawMinutes))
            parsed = TimeSpan.FromMinutes(rawMinutes);
        else
            parsed = TimeSpan.FromDays(3650);

        var minimumSessionLifetime = TimeSpan.FromDays(3650);
        return parsed < minimumSessionLifetime ? minimumSessionLifetime : parsed;
    }
}
