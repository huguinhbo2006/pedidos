<?php

namespace Database\Seeders;

use App\Models\Product;
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

        $defaultProducts = [
            [
                'name' => 'Orden de Tacos Dorados de Papa (4 pzas)',
                'category' => 'Tacos Dorados',
                'description' => 'Crujientes tacos dorados rellenos de papa sazonada con lechuga, crema, queso y salsa.',
                'price' => 75.00,
                'is_active' => true,
            ],
            [
                'name' => 'Orden de Tacos Dorados de Pollo (4 pzas)',
                'category' => 'Tacos Dorados',
                'description' => 'Tacos dorados de pechuga deshebrada con repollo/lechuga, jitomate, crema y queso fresco.',
                'price' => 90.00,
                'is_active' => true,
            ],
            [
                'name' => 'Orden de Tacos Dorados de Res (4 pzas)',
                'category' => 'Tacos Dorados',
                'description' => 'Tacos dorados de carne deshebrada de res, bien doraditos con guarnición completa.',
                'price' => 95.00,
                'is_active' => true,
            ],
            [
                'name' => 'Orden de Tacos Dorados de Frijol (4 pzas)',
                'category' => 'Tacos Dorados',
                'description' => 'Clásicos tacos dorados de frijol refrito con crema, queso y salsa de la casa.',
                'price' => 70.00,
                'is_active' => true,
            ],
            [
                'name' => 'Orden Mixta de Tacos Dorados (4 pzas)',
                'category' => 'Tacos Dorados',
                'description' => 'Combina papa, pollo, res y frijol en una sola orden.',
                'price' => 90.00,
                'is_active' => true,
            ],
            [
                'name' => 'Taco Dorado Individual',
                'category' => 'Tacos Dorados',
                'description' => 'Pieza individual de papa, frijol, pollo o res.',
                'price' => 25.00,
                'is_active' => true,
            ],
            [
                'name' => 'Consomé de Pollo (1/2 Litro)',
                'category' => 'Complementos',
                'description' => 'Caldito caliente con arroz, garbanzo, cebolla y cilantro.',
                'price' => 45.00,
                'is_active' => true,
            ],
            [
                'name' => 'Guacamole con Totopos',
                'category' => 'Extras',
                'description' => 'Porción de guacamole fresco preparado al momento.',
                'price' => 40.00,
                'is_active' => true,
            ],
            [
                'name' => 'Porción Extra de Crema y Queso',
                'category' => 'Extras',
                'description' => 'Vaso adicional de crema ácida y queso rallado.',
                'price' => 20.00,
                'is_active' => true,
            ],
            [
                'name' => 'Salsa Especial de la Casa (Extra)',
                'category' => 'Extras',
                'description' => 'Envase de 4 oz de salsa roja o verde.',
                'price' => 15.00,
                'is_active' => true,
            ],
            [
                'name' => 'Agua Fresca de Horchata (1 Litro)',
                'category' => 'Bebidas',
                'description' => 'Agua fresca natural de arroz con canela y vainilla.',
                'price' => 45.00,
                'is_active' => true,
            ],
            [
                'name' => 'Agua Fresca de Jamaica (1 Litro)',
                'category' => 'Bebidas',
                'description' => 'Agua fresca de flor de jamaica natural.',
                'price' => 42.00,
                'is_active' => true,
            ],
            [
                'name' => 'Refresco 600 ml',
                'category' => 'Bebidas',
                'description' => 'Coca-Cola, Sprite, Fanta o Sidral bien frío.',
                'price' => 30.00,
                'is_active' => true,
            ],
        ];

        foreach ($defaultProducts as $productData) {
            Product::firstOrCreate(
                ['name' => $productData['name']],
                $productData
            );
        }
    }
}
