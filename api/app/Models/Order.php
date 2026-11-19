<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    protected $fillable = [
        'order_number',
        'customer_id',
        'customer_address_id',
        'customer_name',
        'customer_phone',
        'delivery_address',
        'delivery_references',
        'delivery_place_id',
        'delivery_lat',
        'delivery_lng',
        'subtotal',
        'promo_savings',
        'total',
        'notes',
        'is_delivered',
        'delivered_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'delivery_lat' => 'float',
            'delivery_lng' => 'float',
            'subtotal' => 'float',
            'promo_savings' => 'float',
            'total' => 'float',
            'is_delivered' => 'boolean',
            'delivered_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function customerAddress(): BelongsTo
    {
        return $this->belongsTo(CustomerAddress::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
