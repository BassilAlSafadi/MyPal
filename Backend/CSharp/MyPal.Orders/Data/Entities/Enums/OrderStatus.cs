namespace MyPal.Orders.Data.Entities.Enums;

/// <summary>
/// Maps to the SQL CHECK constraint on orders.status:
/// ('Pending', 'Paid', 'Shipped', 'Delivered')
/// </summary>
public enum OrderStatus
{
    Pending   = 1,
    Paid      = 2,
    Shipped   = 3,
    Delivered = 4,
}
