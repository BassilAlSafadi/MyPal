namespace MyPal.ServiceDefaults;

/// <summary>
/// The verified claims carried by a MyPal access token.
///
/// Before the split this shape lived in the Go gateway (internal/gateway/auth.UserIdentity);
/// the gateway validated the token and forwarded the identity to C# as the trusted
/// X-User-Id / X-User-Email / X-User-Roles headers. With the gateway gone each service
/// validates the token itself and then sets those same headers on the inbound request,
/// so handler code that reads them keeps working untouched.
/// </summary>
public sealed record JwtIdentity(
    Guid UserId,
    string Email,
    string[] Roles,
    bool IsBuyer,
    bool IsSeller);

public static class JwtIdentityHeaders
{
    public const string UserId = "X-User-Id";
    public const string UserEmail = "X-User-Email";
    public const string UserRoles = "X-User-Roles";
    public const string IsBuyer = "X-User-Is-Buyer";
    public const string IsSeller = "X-User-Is-Seller";
}
