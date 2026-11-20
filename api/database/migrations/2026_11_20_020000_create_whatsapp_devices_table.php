<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('whatsapp_devices')) {
            Schema::create('whatsapp_devices', function (Blueprint $table) {
                $table->id();
                $table->string('session_id', 80)->unique();
                $table->string('name', 120);
                $table->string('phone', 30)->nullable();
                $table->string('profile_name', 120)->nullable();
                $table->string('status', 30)->default('DISCONNECTED');
                $table->boolean('is_default')->default(false);
                $table->timestamp('last_connected_at')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_devices');
    }
};
