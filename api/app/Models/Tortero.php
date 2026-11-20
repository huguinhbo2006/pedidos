<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Tortero extends Model
{
    public const VALID_DAYS = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
    ];

    protected $fillable = [
        'name',
        'phone',
        'delivery_days',
        'notes',
        'is_active',
        'last_sent_for_date',
        'last_sent_at',
        'skipped_for_date',
    ];

    protected function casts(): array
    {
        return [
            'delivery_days' => 'array',
            'is_active' => 'boolean',
            'last_sent_for_date' => 'date:Y-m-d',
            'last_sent_at' => 'datetime',
            'skipped_for_date' => 'date:Y-m-d',
        ];
    }

    public function deliversOnDay(string $dayKey): bool
    {
        $days = is_array($this->delivery_days) ? $this->delivery_days : [];

        return in_array(strtolower($dayKey), $days, true);
    }
}
