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
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim("email", user.Email),
            new Claim("roles", string.Join(",", user.Roles)),
            new Claim("is_buyer", user.IsBuyer.ToString().ToLower()),
            new Claim("is_seller", user.IsSeller.ToString().ToLower())
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
        var raw = _config["JWT_REFRESH_EXPIRY"] ?? _config["JWT_REFRESH_EXPIRY_MINUTES"] ?? "30d";
        raw = raw.Trim().ToLowerInvariant();

        if (raw.EndsWith("d") && double.TryParse(raw[..^1], out var days))
            return TimeSpan.FromDays(days);
        if (raw.EndsWith("h") && double.TryParse(raw[..^1], out var hours))
            return TimeSpan.FromHours(hours);
        if (raw.EndsWith("m") && double.TryParse(raw[..^1], out var minutes))
            return TimeSpan.FromMinutes(minutes);
        if (double.TryParse(raw, out var rawMinutes))
            return TimeSpan.FromMinutes(rawMinutes);

        return TimeSpan.FromDays(30);
    }
}
