<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PackageGroup extends Model
{
    protected $fillable = [
        'package_id',
        'name',
        'min_quantity',
        'max_quantity',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'min_quantity' => 'integer',
            'max_quantity' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function package(): BelongsTo
    {
        return $this->belongsTo(Package::class);
    }

    public function options(): HasMany
    {
        return $this->hasMany(PackageGroupOption::class)->orderBy('sort_order')->orderBy('id');
    }
}
