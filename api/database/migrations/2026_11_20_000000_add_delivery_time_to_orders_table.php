<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('orders', 'delivery_time')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->string('delivery_time', 60)->nullable()->after('delivery_references');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('orders', 'delivery_time')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropColumn('delivery_time');
            });
        }
    }
};
