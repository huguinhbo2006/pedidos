<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('phone', 30);
            $table->string('role', 50)->default('repartidor');
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'name']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('assigned_employee_id')->nullable()->after('customer_address_id')->constrained('employees')->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('orders', 'assigned_employee_id')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropConstrainedForeignId('assigned_employee_id');
            });
        }
        Schema::dropIfExists('employees');
    }
};
