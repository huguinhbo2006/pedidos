<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('torteros')) {
            Schema::create('torteros', function (Blueprint $table) {
                $table->id();
                $table->string('name', 120);
                $table->string('phone', 30);
                $table->json('delivery_days');
                $table->text('notes')->nullable();
                $table->boolean('is_active')->default(true);
                $table->date('last_sent_for_date')->nullable();
                $table->timestamp('last_sent_at')->nullable();
                $table->date('skipped_for_date')->nullable();
                $table->timestamps();

                $table->index(['is_active', 'name']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('torteros');
    }
};
