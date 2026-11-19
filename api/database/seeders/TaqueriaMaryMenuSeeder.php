<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Package;
use App\Models\PackageGroup;
use App\Models\PackageGroupOption;
use App\Models\Product;
use App\Models\Promotion;
use Illuminate\Support\Facades\DB;

class TaqueriaMaryMenuSeeder
{
    public static function resetDemoDataAndSeedMenu(): void
    {
        DB::transaction(function () {
            OrderItem::query()->delete();
            Order::query()->delete();
            CustomerAddress::query()->delete();
            Customer::query()->delete();
            PackageGroupOption::query()->delete();
            PackageGroup::query()->delete();
            Package::query()->delete();
            Promotion::query()->delete();
            Product::query()->delete();

            static::seedMenuItems();
        });
    }

    public static function seedMenuIfEmpty(): void
    {
        if (Product::count() === 0 && Package::count() === 0 && Promotion::count() === 0) {
            DB::transaction(fn () => static::seedMenuItems());
        }
    }

    private static function seedMenuItems(): void
    {
        $products = [
            // Tacos Normales
            'taco_normal_papa_solo' => Product::create([
                'name' => 'Taco Dorado Normal de Papa (Solo)',
                'category' => 'Tacos Normales',
                'description' => 'Taco dorado tradicional relleno de papa, sin guarnición.',
                'price' => 4.00,
                'is_active' => true,
            ]),
            'taco_normal_papa_prep' => Product::create([
                'name' => 'Taco Dorado Normal de Papa (Con salsa, col y chile)',
                'category' => 'Tacos Normales',
                'description' => 'Taco dorado de papa preparado con salsa, col y chile.',
                'price' => 6.00,
                'is_active' => true,
            ]),
            'taco_normal_frijol_solo' => Product::create([
                'name' => 'Taco Dorado Normal de Frijol (Solo)',
                'category' => 'Tacos Normales',
                'description' => 'Taco dorado tradicional relleno de frijol, sin guarnición.',
                'price' => 4.00,
                'is_active' => true,
            ]),
            'taco_normal_frijol_prep' => Product::create([
                'name' => 'Taco Dorado Normal de Frijol (Con salsa, col y chile)',
                'category' => 'Tacos Normales',
                'description' => 'Taco dorado de frijol preparado con salsa, col y chile.',
                'price' => 6.00,
                'is_active' => true,
            ]),
            'taco_normal_requeson_solo' => Product::create([
                'name' => 'Taco Dorado Normal de Requesón (Solo)',
                'category' => 'Tacos Normales',
                'description' => 'Taco dorado de requesón, sin guarnición.',
                'price' => 5.00,
                'is_active' => true,
            ]),
            'taco_normal_requeson_prep' => Product::create([
                'name' => 'Taco Dorado Normal de Requesón (Con salsa, col y chile)',
                'category' => 'Tacos Normales',
                'description' => 'Taco dorado de requesón preparado con salsa, col y chile.',
                'price' => 7.00,
                'is_active' => true,
            ]),

            // Tacos Botaneros (Papa o Frijol)
            'taco_botanero_papa_solo' => Product::create([
                'name' => 'Taco Botanero de Papa (Solo)',
                'category' => 'Tacos Botaneros',
                'description' => 'Taco botanero crujiente de papa, solo.',
                'price' => 2.00,
                'is_active' => true,
            ]),
            'taco_botanero_papa_prep' => Product::create([
                'name' => 'Taco Botanero de Papa (Con salsa, col y chile)',
                'category' => 'Tacos Botaneros',
                'description' => 'Taco botanero de papa preparado con salsa, col y chile.',
                'price' => 3.50,
                'is_active' => true,
            ]),
            'taco_botanero_frijol_solo' => Product::create([
                'name' => 'Taco Botanero de Frijol (Solo)',
                'category' => 'Tacos Botaneros',
                'description' => 'Taco botanero crujiente de frijol, solo.',
                'price' => 2.00,
                'is_active' => true,
            ]),
            'taco_botanero_frijol_prep' => Product::create([
                'name' => 'Taco Botanero de Frijol (Con salsa, col y chile)',
                'category' => 'Tacos Botaneros',
                'description' => 'Taco botanero de frijol preparado con salsa, col y chile.',
                'price' => 3.50,
                'is_active' => true,
            ]),

            // Aguas Frescas
            'agua_horchata' => Product::create([
                'name' => 'Agua Fresca de Horchata (1 Litro)',
                'category' => 'Aguas Frescas',
                'description' => 'Litro de agua fresca natural de horchata.',
                'price' => 15.00,
                'is_active' => true,
            ]),
            'agua_jamaica' => Product::create([
                'name' => 'Agua Fresca de Jamaica (1 Litro)',
                'category' => 'Aguas Frescas',
                'description' => 'Litro de agua fresca natural de jamaica.',
                'price' => 15.00,
                'is_active' => true,
            ]),

            // Desechables y Extras
            'platos_desechables' => Product::create([
                'name' => 'Platos Desechables',
                'category' => 'Desechables y Extras',
                'description' => 'Paquete de platos desechables para evento.',
                'price' => 40.00,
                'is_active' => true,
            ]),
            'desechable_100' => Product::create([
                'name' => 'Desechable para 100 personas',
                'category' => 'Desechables y Extras',
                'description' => 'Kit de desechables completo para 100 personas.',
                'price' => 120.00,
                'is_active' => true,
            ]),
        ];

        $createNormalTacosGroup = function (Package $pkg, int $maxQty) use ($products): void {
            $group = PackageGroup::create([
                'package_id' => $pkg->id,
                'name' => 'Tacos Dorados Normales (con salsa, col y chile)',
                'min_quantity' => 1,
                'max_quantity' => $maxQty,
                'sort_order' => 1,
            ]);
            PackageGroupOption::create([
                'package_group_id' => $group->id,
                'product_id' => $products['taco_normal_papa_prep']->id,
                'label' => 'Papa (Con salsa, col y chile)',
                'extra_price' => 0.00,
                'is_active' => true,
                'sort_order' => 1,
            ]);
            PackageGroupOption::create([
                'package_group_id' => $group->id,
                'product_id' => $products['taco_normal_frijol_prep']->id,
                'label' => 'Frijol (Con salsa, col y chile)',
                'extra_price' => 0.00,
                'is_active' => true,
                'sort_order' => 2,
            ]);
            PackageGroupOption::create([
                'package_group_id' => $group->id,
                'product_id' => $products['taco_normal_requeson_prep']->id,
                'label' => 'Requesón (Con salsa, col y chile)',
                'extra_price' => 1.00,
                'is_active' => true,
                'sort_order' => 3,
            ]);
        };

        $createWaterGroup = function (Package $pkg, int $maxLiters, int $sortOrder = 2) use ($products): void {
            $group = PackageGroup::create([
                'package_id' => $pkg->id,
                'name' => 'Agua Fresca (Litros)',
                'min_quantity' => 0,
                'max_quantity' => $maxLiters,
                'sort_order' => $sortOrder,
            ]);
            PackageGroupOption::create([
                'package_group_id' => $group->id,
                'product_id' => $products['agua_horchata']->id,
                'label' => 'Agua de Horchata (1 Litro)',
                'extra_price' => 0.00,
                'is_active' => true,
                'sort_order' => 1,
            ]);
            PackageGroupOption::create([
                'package_group_id' => $group->id,
                'product_id' => $products['agua_jamaica']->id,
                'label' => 'Agua de Jamaica (1 Litro)',
                'extra_price' => 0.00,
                'is_active' => true,
                'sort_order' => 2,
            ]);
        };

        // 1. Paquete Fiesta Básica ($600)
        $pkg1 = Package::create([
            'name' => 'Paquete Fiesta Básica',
            'description' => '100 tacos dorados con salsa, col y chile + 5 litros de agua (jamaica u horchata).',
            'base_price' => 600.00,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        $createNormalTacosGroup($pkg1, 100);
        $createWaterGroup($pkg1, 5, 2);

        // 2. Paquete Reunión Familiar ($1,200)
        $pkg2 = Package::create([
            'name' => 'Paquete Reunión Familiar',
            'description' => '200 tacos dorados con salsa, col y chile + 10 litros de agua (jamaica u horchata).',
            'base_price' => 1200.00,
            'is_active' => true,
            'sort_order' => 2,
        ]);
        $createNormalTacosGroup($pkg2, 200);
        $createWaterGroup($pkg2, 10, 2);

        // 3. Paquete Antojo Botanero ($1,000) — SOLO Papa y Frijol
        $pkg3 = Package::create([
            'name' => 'Paquete Antojo Botanero',
            'description' => '300 tacos botaneros con salsa, col y chile (solo papa o frijol) + 5 litros de agua.',
            'base_price' => 1000.00,
            'is_active' => true,
            'sort_order' => 3,
        ]);
        $botaneroGroup = PackageGroup::create([
            'package_id' => $pkg3->id,
            'name' => 'Tacos Botaneros (solo Papa y Frijol)',
            'min_quantity' => 1,
            'max_quantity' => 300,
            'sort_order' => 1,
        ]);
        PackageGroupOption::create([
            'package_group_id' => $botaneroGroup->id,
            'product_id' => $products['taco_botanero_papa_prep']->id,
            'label' => 'Papa Botanero (Con salsa, col y chile)',
            'extra_price' => 0.00,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        PackageGroupOption::create([
            'package_group_id' => $botaneroGroup->id,
            'product_id' => $products['taco_botanero_frijol_prep']->id,
            'label' => 'Frijol Botanero (Con salsa, col y chile)',
            'extra_price' => 0.00,
            'is_active' => true,
            'sort_order' => 2,
        ]);
        $createWaterGroup($pkg3, 5, 2);

        // 4. Paquete Gran Fiesta ($4,000)
        $pkg4 = Package::create([
            'name' => 'Paquete Gran Fiesta',
            'description' => '500 tacos normales con salsa, col y chile + 50 litros de agua + desechable para 100 personas.',
            'base_price' => 4000.00,
            'is_active' => true,
            'sort_order' => 4,
        ]);
        $createNormalTacosGroup($pkg4, 500);
        $createWaterGroup($pkg4, 50, 2);
        $dispGroup = PackageGroup::create([
            'package_id' => $pkg4->id,
            'name' => 'Desechables Incluidos',
            'min_quantity' => 0,
            'max_quantity' => 1,
            'sort_order' => 3,
        ]);
        PackageGroupOption::create([
            'package_group_id' => $dispGroup->id,
            'product_id' => $products['desechable_100']->id,
            'label' => 'Desechable para 100 personas (Incluido)',
            'extra_price' => 0.00,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        // Promoción oficial de Taquería Mary
        Promotion::create([
            'name' => '¡5 Litros de Agua Extra GRATIS!',
            'description' => 'En la compra de cualquier paquete: ¡5 litros de agua extra gratis (Jamaica u Horchata)!',
            'applies_to_packages' => true,
            'max_quantity' => 5,
            'allowed_options' => [
                'Agua de Horchata (1 Litro)',
                'Agua de Jamaica (1 Litro)',
            ],
            'is_active' => true,
        ]);
    }
}
