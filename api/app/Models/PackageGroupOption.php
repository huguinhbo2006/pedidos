<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PackageGroupOption extends Model
{
    protected $fillable = [
        'package_group_id',
        'product_id',
        'label',
        'extra_price',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'extra_price' => 'float',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(PackageGroup::class, 'package_group_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
