<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Package;
use App\Models\Product;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TacosDoradosApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_single_user_login_and_auth_protection(): void
    {
        $this->getJson('/api/orders/today')->assertStatus(401);

        $this->assertSame(1, User::count());
        $this->assertDatabaseHas('users', ['username' => 'hugo.perez']);

        $this->postJson('/api/login', [
            'username' => 'hugo.perez',
            'password' => 'wrong',
        ])->assertStatus(422);

        $response = $this->postJson('/api/login', [
            'username' => 'hugo.perez',
            'password' => '12345',
        ])->assertOk();

        $token = $response->json('token');
        $this->assertNotEmpty($token);

        $this->withToken($token)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('username', 'hugo.perez');
    }

    public function test_taqueria_mary_product_catalog_crud_and_usage_guard(): void
    {
        $token = $this->authenticate();

        $this->withToken($token)
            ->getJson('/api/products')
            ->assertOk()
            ->assertJsonCount(14);

        $created = $this->withToken($token)
            ->postJson('/api/products', [
                'name' => 'Agua de Limón con Chía (1 Litro)',
                'category' => 'Aguas Frescas',
                'description' => 'Fresca del día',
                'price' => 18,
                'is_active' => true,
            ])
            ->assertStatus(201)
            ->json();

        $this->withToken($token)
            ->putJson("/api/products/{$created['id']}", [
                'name' => 'Agua de Limón Especial (1 Litro)',
                'category' => 'Aguas Frescas',
                'description' => 'Con chía',
                'price' => 20,
                'is_active' => true,
            ])
            ->assertOk()
            ->assertJsonPath('price', 20);

        $this->withToken($token)
            ->patchJson("/api/products/{$created['id']}/toggle")
            ->assertOk()
            ->assertJsonPath('is_active', false);

        $this->withToken($token)
            ->deleteJson("/api/products/{$created['id']}")
            ->assertOk();
    }

    public function test_order_creates_customer_assigns_addresses_calculates_sum_with_free_promos_and_hides_after_delivery(): void
    {
        $token = $this->authenticate();

        $tacoPapa = Product::where('name', 'Taco Dorado Normal de Papa (Con salsa, col y chile)')->firstOrFail();
        $agua = Product::where('name', 'Agua Fresca de Horchata (1 Litro)')->firstOrFail();

        $firstOrderResp = $this->withToken($token)
            ->postJson('/api/orders', [
                'customer_phone' => '33 1234 5678',
                'customer_name' => 'María López',
                'delivery_address' => 'Av. Vallarta 1500, Guadalajara, Jalisco',
                'delivery_references' => 'Portón blanco, esquina Chapultepec',
                'delivery_place_id' => 'place_vallarta_1500',
                'delivery_lat' => 20.6745,
                'delivery_lng' => -103.368,
                'address_label' => 'Casa',
                'notes' => 'Salsa aparte',
                'items' => [
                    [
                        'item_type' => 'product',
                        'product_id' => $tacoPapa->id,
                        'quantity' => 10,
                        'is_promo' => false,
                    ],
                    [
                        'item_type' => 'product',
                        'product_id' => $agua->id,
                        'quantity' => 2,
                        'is_promo' => true,
                        'promo_reason' => 'Regalo por pedido',
                    ],
                ],
            ])
            ->assertStatus(201);

        $expectedSubtotal = round($tacoPapa->price * 10, 2);
        $expectedSavings = round($agua->price * 2, 2);

        $firstOrderResp
            ->assertJsonPath('customer_phone', '3312345678')
            ->assertJsonPath('customer_name', 'María López')
            ->assertJsonPath('is_delivered', false);

        $this->assertEquals($expectedSubtotal, $firstOrderResp->json('subtotal'));
        $this->assertEquals($expectedSavings, $firstOrderResp->json('promo_savings'));
        $this->assertEquals($expectedSubtotal, $firstOrderResp->json('total'));

        $firstOrderId = $firstOrderResp->json('id');

        $lookup = $this->withToken($token)
            ->getJson('/api/customers/by-phone?phone=3312345678')
            ->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('customer.name', 'María López')
            ->assertJsonCount(1, 'customer.addresses');

        $customerId = $lookup->json('customer.id');

        $secondOrderResp = $this->withToken($token)
            ->postJson('/api/orders', [
                'customer_phone' => '3312345678',
                'customer_name' => 'María López',
                'delivery_address' => 'Calle Hidalgo 420, Centro, Guadalajara',
                'delivery_references' => 'Oficina piso 2',
                'address_label' => 'Trabajo',
                'items' => [
                    [
                        'item_type' => 'product',
                        'product_id' => $tacoPapa->id,
                        'quantity' => 5,
                        'is_promo' => false,
                    ],
                ],
            ])
            ->assertStatus(201);

        $secondOrderId = $secondOrderResp->json('id');

        $this->assertSame(1, Customer::count());
        $this->withToken($token)
            ->getJson('/api/customers/by-phone?phone=33-1234-5678')
            ->assertOk()
            ->assertJsonPath('customer.id', $customerId)
            ->assertJsonCount(2, 'customer.addresses');

        $this->withToken($token)
            ->getJson('/api/orders/today')
            ->assertOk()
            ->assertJsonCount(2, 'orders')
            ->assertJsonPath('summary.pending_count', 2)
            ->assertJsonPath('summary.delivered_count', 0);

        $this->withToken($token)
            ->patchJson("/api/orders/{$firstOrderId}/deliver")
            ->assertOk()
            ->assertJsonPath('order.is_delivered', true);

        $todayAfterDeliver = $this->withToken($token)
            ->getJson('/api/orders/today')
            ->assertOk()
            ->assertJsonCount(1, 'orders')
            ->assertJsonPath('summary.pending_count', 1)
            ->assertJsonPath('summary.delivered_count', 1);

        $this->assertSame($secondOrderId, $todayAfterDeliver->json('orders.0.id'));

        $this->withToken($token)
            ->getJson('/api/orders?status=delivered')
            ->assertOk()
            ->assertJsonCount(1);
    }

    public function test_packages_with_limits_requeson_extra_price_promotions_and_pdf_generation(): void
    {
        $token = $this->authenticate();

        $this->withToken($token)
            ->getJson('/api/packages')
            ->assertOk()
            ->assertJsonCount(4);

        $this->withToken($token)
            ->getJson('/api/promotions')
            ->assertOk()
            ->assertJsonCount(1);

        $fiestaBasica = Package::with('groups.options')->where('name', 'Paquete Fiesta Básica')->firstOrFail();
        $tacosGroup = $fiestaBasica->groups->first();
        $waterGroup = $fiestaBasica->groups->last();

        $papaOption = $tacosGroup->options->firstWhere('label', 'Papa (Con salsa, col y chile)');
        $requesonOption = $tacosGroup->options->firstWhere('label', 'Requesón (Con salsa, col y chile)');
        $horchataOption = $waterGroup->options->firstWhere('label', 'Agua de Horchata (1 Litro)');

        // Exceeding 100 tacos limit must fail validation
        $this->withToken($token)
            ->postJson('/api/orders', [
                'customer_phone' => '3320536289',
                'customer_name' => 'Carlos Ruiz',
                'delivery_address' => 'Av. México 200',
                'items' => [
                    [
                        'item_type' => 'package',
                        'package_id' => $fiestaBasica->id,
                        'quantity' => 1,
                        'is_promo' => false,
                        'package_details' => [
                            [
                                'group_id' => $tacosGroup->id,
                                'option_id' => $papaOption->id,
                                'group' => $tacosGroup->name,
                                'label' => $papaOption->label,
                                'quantity' => 101,
                            ],
                        ],
                    ],
                ],
            ])
            ->assertStatus(422);

        // Valid package: $600 base + 40 Requeson * $1 extra = $640 + Free 5L Agua Promo ($0)
        $orderResp = $this->withToken($token)
            ->postJson('/api/orders', [
                'customer_phone' => '3320536289',
                'customer_name' => 'Carlos Ruiz',
                'delivery_address' => 'Av. México 200, Guadalajara',
                'items' => [
                    [
                        'item_type' => 'package',
                        'package_id' => $fiestaBasica->id,
                        'quantity' => 1,
                        'is_promo' => false,
                        'package_details' => [
                            [
                                'group_id' => $tacosGroup->id,
                                'option_id' => $papaOption->id,
                                'group' => $tacosGroup->name,
                                'label' => $papaOption->label,
                                'quantity' => 60,
                            ],
                            [
                                'group_id' => $tacosGroup->id,
                                'option_id' => $requesonOption->id,
                                'group' => $tacosGroup->name,
                                'label' => $requesonOption->label,
                                'quantity' => 40,
                            ],
                            [
                                'group_id' => $waterGroup->id,
                                'option_id' => $horchataOption->id,
                                'group' => $waterGroup->name,
                                'label' => $horchataOption->label,
                                'quantity' => 5,
                            ],
                        ],
                    ],
                    [
                        'item_type' => 'promo_custom',
                        'product_name' => 'Regalo: 5L Agua de Horchata',
                        'quantity' => 1,
                        'is_promo' => true,
                        'promo_reason' => '¡5 Litros de Agua Extra GRATIS!',
                    ],
                ],
            ])
            ->assertStatus(201);

        $this->assertEquals(640, $orderResp->json('total'));
        $orderId = $orderResp->json('id');

        // Verify PDF generation endpoint
        $pdfResp = $this->withToken($token)
            ->get("/api/orders/{$orderId}/pdf")
            ->assertOk();

        $this->assertStringContainsString('application/pdf', (string) $pdfResp->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF-', $pdfResp->getContent());
    }

    public function test_packages_and_promotions_crud_and_maps_settings(): void
    {
        $token = $this->authenticate();

        $tacoPapa = Product::where('name', 'Taco Dorado Normal de Papa (Solo)')->firstOrFail();

        $pkg = $this->withToken($token)
            ->postJson('/api/packages', [
                'name' => 'Paquete Prueba 50 Tacos',
                'description' => 'Solo papa y frijol',
                'base_price' => 250,
                'groups' => [
                    [
                        'name' => 'Tacos Solos',
                        'min_quantity' => 1,
                        'max_quantity' => 50,
                        'options' => [
                            [
                                'product_id' => $tacoPapa->id,
                                'label' => 'Papa Solo',
                                'extra_price' => 0,
                                'is_active' => true,
                            ],
                        ],
                    ],
                ],
            ])
            ->assertStatus(201)
            ->json();

        $this->withToken($token)->patchJson("/api/packages/{$pkg['id']}/toggle")->assertOk();
        $this->withToken($token)->deleteJson("/api/packages/{$pkg['id']}")->assertOk();

        $promo = $this->withToken($token)
            ->postJson('/api/promotions', [
                'name' => 'Refresco Gratis',
                'description' => 'Regalo',
                'applies_to_packages' => true,
                'max_quantity' => 2,
                'allowed_options' => ['Horchata', 'Jamaica'],
            ])
            ->assertStatus(201)
            ->json();

        $this->withToken($token)->patchJson("/api/promotions/{$promo['id']}/toggle")->assertOk();
        $this->withToken($token)->deleteJson("/api/promotions/{$promo['id']}")->assertOk();

        $this->withToken($token)
            ->putJson('/api/settings/maps', [
                'api_key' => 'AIzaTestKey123',
                'region' => 'mx',
            ])
            ->assertOk()
            ->assertJsonPath('has_google_maps_key', true);
    }

    public function test_three_promotion_types_and_manual_order_discount(): void
    {
        $token = $this->authenticate();

        $fiestaBasica = Package::where('name', 'Paquete Fiesta Básica')->firstOrFail();
        $reunionFamiliar = Package::where('name', 'Paquete Reunión Familiar')->firstOrFail();
        $tacoPapa = Product::where('name', 'Taco Dorado Normal de Papa (Con salsa, col y chile)')->firstOrFail();
        $horchata = Product::where('name', 'Agua Fresca de Horchata (1 Litro)')->firstOrFail();

        // Tipo 2: Descuento en % sobre paquetes específicos (5% en Fiesta Básica o Reunión Familiar)
        $discountPromo = $this->withToken($token)
            ->postJson('/api/promotions', [
                'name' => '5% de descuento en paquetes familiares',
                'description' => 'Descuento automático en Fiesta Básica y Reunión Familiar',
                'type' => 'discount',
                'target_scope' => 'packages',
                'target_package_ids' => [$fiestaBasica->id, $reunionFamiliar->id],
                'min_quantity' => 1,
                'discount_type' => 'percent',
                'discount_value' => 5,
            ])
            ->assertStatus(201)
            ->json();

        // Tipo 3: Combo Promocional a Precio Fijo ($280 por 50 tacos + 2L horchata)
        $comboPromo = $this->withToken($token)
            ->postJson('/api/promotions', [
                'name' => 'Combo Promo 50 Tacos + 2L Agua',
                'description' => 'Precio especial fijo',
                'type' => 'fixed_price_combo',
                'fixed_price' => 280,
                'combo_items' => [
                    ['product_id' => $tacoPapa->id, 'quantity' => 50],
                    ['product_id' => $horchata->id, 'quantity' => 2],
                ],
            ])
            ->assertStatus(201)
            ->json();

        $this->assertEquals(280, $comboPromo['fixed_price']);

        // Orden combinando Paquete ($600) + Combo Promo ($280) + Descuento Tipo 2 (5% de $600 = $30) + Descuento Manual ($50)
        // Subtotal = $880; Promo Discount = $30 -> remaining = $850; Manual = $50 -> Total = $800
        $tacosGroup = $fiestaBasica->groups()->firstOrFail();
        $papaOption = $tacosGroup->options()->where('label', 'like', '%Papa%')->firstOrFail();

        $order = $this->withToken($token)
            ->postJson('/api/orders', [
                'customer_phone' => '3311112222',
                'customer_name' => 'Luis Ramírez',
                'delivery_address' => 'Calle Juárez 100',
                'applied_promotion_ids' => [$discountPromo['id']],
                'manual_discount_type' => 'fixed',
                'manual_discount_value' => 50,
                'manual_discount_reason' => 'Cliente frecuente',
                'items' => [
                    [
                        'item_type' => 'package',
                        'package_id' => $fiestaBasica->id,
                        'quantity' => 1,
                        'is_promo' => false,
                        'package_details' => [
                            [
                                'group_id' => $tacosGroup->id,
                                'option_id' => $papaOption->id,
                                'group' => $tacosGroup->name,
                                'label' => $papaOption->label,
                                'quantity' => 100,
                            ],
                        ],
                    ],
                    [
                        'item_type' => 'promo_combo',
                        'promotion_id' => $comboPromo['id'],
                        'quantity' => 1,
                        'is_promo' => false,
                    ],
                ],
            ])
            ->assertStatus(201);

        $this->assertEquals(880, $order->json('subtotal'));
        $this->assertEquals(30, $order->json('promo_discount_amount'));
        $this->assertEquals(50, $order->json('manual_discount_amount'));
        $this->assertEquals(800, $order->json('total'));

        // Verify PDF renders with promo & manual discounts
        $pdfResp = $this->withToken($token)->get("/api/orders/{$order->json('id')}/pdf")->assertOk();
        $this->assertStringStartsWith('%PDF-', $pdfResp->getContent());
    }

    private function authenticate(): string
    {
        return $this->postJson('/api/login', [
            'username' => 'hugo.perez',
            'password' => '12345',
        ])->assertOk()->json('token');
    }
}
