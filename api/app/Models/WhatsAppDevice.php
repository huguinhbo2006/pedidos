<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppDevice extends Model
{
    protected $table = 'whatsapp_devices';

    protected $fillable = [
        'session_id',
        'name',
        'phone',
        'profile_name',
        'status',
        'is_default',
        'last_connected_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'last_connected_at' => 'datetime',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
