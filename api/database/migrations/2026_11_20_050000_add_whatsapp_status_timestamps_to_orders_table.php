<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'on_the_way_sent_at')) {
                $table->timestamp('on_the_way_sent_at')->nullable()->after('delivered_at');
            }
            if (! Schema::hasColumn('orders', 'thank_you_sent_at')) {
                $table->timestamp('thank_you_sent_at')->nullable()->after('on_the_way_sent_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $drop = [];
            if (Schema::hasColumn('orders', 'on_the_way_sent_at')) {
                $drop[] = 'on_the_way_sent_at';
            }
            if (Schema::hasColumn('orders', 'thank_you_sent_at')) {
                $drop[] = 'thank_you_sent_at';
            }
            if (! empty($drop)) {
                $table->dropColumn($drop);
            }
        });
    }
};
