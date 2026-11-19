<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Enforce single user: hugo.perez / 12345
        User::where('username', '!=', 'hugo.perez')
            ->orWhereNull('username')
            ->delete();

        User::updateOrCreate(
            ['username' => 'hugo.perez'],
            [
                'name' => 'Hugo Pérez',
                'email' => 'hugo.perez@tacosdorados.local',
                'password' => '12345',
            ]
        );

        TaqueriaMaryMenuSeeder::seedMenuIfEmpty();
    }
}
