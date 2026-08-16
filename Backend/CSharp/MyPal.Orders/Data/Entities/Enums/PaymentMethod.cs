namespace MyPal.Orders.Data.Entities.Enums;

/// <summary>
/// Maps to the SQL CHECK constraint on orders.payment_method:
/// ('Wallet', 'COD', 'Split')
///
/// Wallet — full payment deducted from the user's in-app wallet balance.
/// COD    — full payment collected in cash by the rider on delivery.
/// Split  — partial wallet deduction + remaining cash on delivery.
/// </summary>
public enum PaymentMethod
{
    Wallet = 1,
    Cod    = 2,
    Split  = 3,
}
