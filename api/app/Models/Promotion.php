<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Promotion extends Model
{
    protected $fillable = [
        'name',
        'description',
        'type',
        'target_scope',
        'applies_to_packages',
        'target_package_ids',
        'target_product_ids',
        'min_order_amount',
        'min_quantity',
        'max_quantity',
        'allowed_options',
        'reward_products',
        'discount_type',
        'discount_value',
        'fixed_price',
        'combo_items',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'applies_to_packages' => 'boolean',
            'target_package_ids' => 'array',
            'target_product_ids' => 'array',
            'min_order_amount' => 'float',
            'min_quantity' => 'integer',
            'max_quantity' => 'integer',
            'allowed_options' => 'array',
            'reward_products' => 'array',
            'discount_value' => 'float',
            'fixed_price' => 'float',
            'combo_items' => 'array',
            'is_active' => 'boolean',
        ];
    }
}
