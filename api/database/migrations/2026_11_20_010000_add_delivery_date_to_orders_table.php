<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('orders', 'delivery_date')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->date('delivery_date')->nullable()->index()->after('delivery_references');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('orders', 'delivery_date')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropColumn('delivery_date');
            });
        }
    }
};
