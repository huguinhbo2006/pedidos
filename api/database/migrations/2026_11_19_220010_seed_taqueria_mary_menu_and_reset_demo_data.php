<?php

use Database\Seeders\TaqueriaMaryMenuSeeder;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        TaqueriaMaryMenuSeeder::resetDemoDataAndSeedMenu();
    }

    public function down(): void
    {
        // Irreversible data reset migration
    }
};
