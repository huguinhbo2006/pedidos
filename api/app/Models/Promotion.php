<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Promotion extends Model
{
    protected $fillable = [
        'name',
        'description',
        'applies_to_packages',
        'max_quantity',
        'allowed_options',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'applies_to_packages' => 'boolean',
            'max_quantity' => 'integer',
            'allowed_options' => 'array',
            'is_active' => 'boolean',
        ];
    }
}
