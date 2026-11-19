<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    protected $fillable = [
        'phone',
        'name',
        'notes',
    ];

    public static function normalizePhone(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', $raw) ?? '';

        return $digits !== '' ? $digits : trim($raw);
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(CustomerAddress::class)
            ->orderByDesc('last_used_at')
            ->orderByDesc('id');
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class)->orderByDesc('created_at');
    }
}
