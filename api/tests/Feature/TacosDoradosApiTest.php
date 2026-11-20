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
                'delivery_time' => '14:30',
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
        $this->assertEquals('14:30', $order->json('delivery_time'));

        // Verify PDF renders with promo & manual discounts
        $pdfResp = $this->withToken($token)->get("/api/orders/{$order->json('id')}/pdf")->assertOk();
        $this->assertStringStartsWith('%PDF-', $pdfResp->getContent());
    }

    public function test_order_scheduled_delivery_date_upcoming_filter_update_and_destroy(): void
    {
        $token = $this->authenticate();
        $tacoPapa = Product::where('name', 'Taco Dorado Normal de Papa (Con salsa, col y chile)')->firstOrFail();

        $tomorrow = \Carbon\Carbon::tomorrow()->toDateString();

        // 1. Crear un pedido programado para mañana
        $createResp = $this->withToken($token)
            ->postJson('/api/orders', [
                'customer_phone' => '3399887766',
                'customer_name' => 'Roberto Gómez',
                'delivery_address' => 'Av. Hidalgo 450',
                'delivery_date' => $tomorrow,
                'delivery_time' => '15:00',
                'items' => [
                    [
                        'item_type' => 'product',
                        'product_id' => $tacoPapa->id,
                        'quantity' => 20,
                        'is_promo' => false,
                    ],
                ],
            ])
            ->assertStatus(201);

        $orderId = $createResp->json('id');
        $this->assertEquals($tomorrow, $createResp->json('delivery_date'));
        $this->assertEquals(20 * $tacoPapa->price, $createResp->json('total'));

        // 2. Verificar que en /api/orders/today NO aparece como pendiente de hoy, sino en upcoming_orders
        $todayResp = $this->withToken($token)
            ->getJson('/api/orders/today')
            ->assertOk();

        $this->assertEmpty(collect($todayResp->json('orders'))->where('id', $orderId));
        $this->assertNotEmpty(collect($todayResp->json('upcoming_orders'))->where('id', $orderId));
        $this->assertEquals(1, $todayResp->json('summary.upcoming_count'));

        // 3. Verificar endpoint dedicado /api/orders/upcoming
        $upcomingResp = $this->withToken($token)
            ->getJson('/api/orders/upcoming')
            ->assertOk();
        $this->assertCount(1, $upcomingResp->json());
        $this->assertEquals($orderId, $upcomingResp->json('0.id'));

        // 4. Modificar el pedido (cambiar cantidad a 30, cambiar hora a 16:00 y cambiar dirección)
        $updateResp = $this->withToken($token)
            ->putJson("/api/orders/{$orderId}", [
                'customer_phone' => '3399887766',
                'customer_name' => 'Roberto Gómez Editado',
                'delivery_address' => 'Av. Hidalgo 500 Interior 2',
                'delivery_date' => $tomorrow,
                'delivery_time' => '16:00',
                'items' => [
                    [
                        'item_type' => 'product',
                        'product_id' => $tacoPapa->id,
                        'quantity' => 30,
                        'is_promo' => false,
                    ],
                ],
            ])
            ->assertOk();

        $this->assertEquals('Roberto Gómez Editado', $updateResp->json('customer_name'));
        $this->assertEquals('Av. Hidalgo 500 Interior 2', $updateResp->json('delivery_address'));
        $this->assertEquals('16:00', $updateResp->json('delivery_time'));
        $this->assertEquals(30 * $tacoPapa->price, $updateResp->json('total'));

        // 5. Eliminar el pedido con confirmación (DELETE)
        $deleteResp = $this->withToken($token)
            ->deleteJson("/api/orders/{$orderId}")
            ->assertOk();

        $this->assertStringContainsString('eliminado correctamente', $deleteResp->json('message'));
        $this->assertDatabaseMissing('orders', ['id' => $orderId]);
        $this->assertDatabaseMissing('order_items', ['order_id' => $orderId]);
    }

    public function test_whatsapp_devices_crud_and_settings(): void
    {
        $token = $this->authenticate();

        \Illuminate\Support\Facades\Http::fake([
            '*/sessions' => \Illuminate\Support\Facades\Http::response(['sessions' => []], 200),
            '*/sessions/*/start' => \Illuminate\Support\Facades\Http::response(['status' => 'QR_READY', 'qrRaw' => 'test-qr', 'qrImage' => 'data:image/png;base64,abc'], 200),
            '*/sessions/*/qr' => \Illuminate\Support\Facades\Http::response(['status' => 'CONNECTED', 'phone' => '5213320536289'], 200),
            '*/sessions/*' => \Illuminate\Support\Facades\Http::response(['success' => true], 200),
        ]);

        // 1. Listar dispositivos inicialmente vacío
        $this->withToken($token)
            ->getJson('/api/whatsapp/devices')
            ->assertOk()
            ->assertJsonCount(0, 'devices');

        // 2. Crear primer dispositivo
        $create1 = $this->withToken($token)
            ->postJson('/api/whatsapp/devices', [
                'name' => 'Línea Taquería Principal',
            ])
            ->assertStatus(201)
            ->json();

        $this->assertTrue($create1['device']['is_default']);
        $deviceId1 = $create1['device']['id'];

        // 3. Crear segundo dispositivo
        $create2 = $this->withToken($token)
            ->postJson('/api/whatsapp/devices', [
                'name' => 'Línea Repartidores',
            ])
            ->assertStatus(201)
            ->json();

        $this->assertFalse($create2['device']['is_default']);
        $deviceId2 = $create2['device']['id'];

        // 4. Cambiar predeterminado al segundo dispositivo
        $this->withToken($token)
            ->patchJson("/api/whatsapp/devices/{$deviceId2}/default")
            ->assertOk()
            ->assertJsonPath('is_default', true);

        $this->assertDatabaseHas('whatsapp_devices', ['id' => $deviceId1, 'is_default' => 0]);
        $this->assertDatabaseHas('whatsapp_devices', ['id' => $deviceId2, 'is_default' => 1]);

        // 5. Consultar QR (simula que se conectó en el mock)
        $qrResp = $this->withToken($token)
            ->getJson("/api/whatsapp/devices/{$deviceId1}/qr")
            ->assertOk();

        $this->assertEquals('CONNECTED', $qrResp->json('status'));
        $this->assertEquals('5213320536289', $qrResp->json('phone'));

        // 5.5 Probar envío de mensaje de prueba
        $testMsgResp = $this->withToken($token)
            ->postJson("/api/whatsapp/devices/{$deviceId1}/test-message", [
                'numero' => '3312345678',
                'mensaje' => '¡Hola! Este es un mensaje de prueba',
            ])
            ->assertOk();

        $this->assertTrue($testMsgResp->json('success'));
        $this->assertEquals('¡Mensaje de prueba enviado exitosamente!', $testMsgResp->json('message'));

        // 6. Configuración de URL de WhatsApp
        $this->withToken($token)
            ->putJson('/api/whatsapp/settings', [
                'whatsapp_api_url' => 'https://custom-whatsapp.up.railway.app',
            ])
            ->assertOk()
            ->assertJsonPath('whatsapp_api_url', 'https://custom-whatsapp.up.railway.app');

        // 7. Eliminar dispositivo
        $this->withToken($token)
            ->deleteJson("/api/whatsapp/devices/{$deviceId2}")
            ->assertOk();

        $this->assertDatabaseMissing('whatsapp_devices', ['id' => $deviceId2]);
    }

    public function test_employee_catalog_crud_and_order_whatsapp(): void
    {
        $token = $this->authenticate();

        \Illuminate\Support\Facades\Http::fake([
            '*/sessions/*/send-message' => \Illuminate\Support\Facades\Http::response([
                'success' => true,
                'messageId' => 'test-msg-123',
                'status' => 'sent',
            ], 200),
        ]);

        // 1. Crear dispositivo WhatsApp conectado
        \App\Models\WhatsAppDevice::create([
            'session_id' => 'sesion_prueba',
            'name' => 'Línea Pedidos',
            'status' => 'CONNECTED',
            'phone' => '5213320536289',
            'is_default' => true,
        ]);

        // 2. Crear empleado
        $empResp = $this->withToken($token)
            ->postJson('/api/employees', [
                'name' => 'Juan Repartidor',
                'phone' => '3311223344',
                'role' => 'repartidor',
                'notes' => 'Turno vespertino',
            ])
            ->assertStatus(201)
            ->json();

        $employeeId = $empResp['id'];
        $this->assertEquals('Juan Repartidor', $empResp['name']);
        $this->assertEquals('repartidor', $empResp['role']);

        // 3. Listar empleados
        $listResp = $this->withToken($token)
            ->getJson('/api/employees')
            ->assertOk()
            ->json();

        $this->assertNotEmpty($listResp);
        $this->assertEquals('Juan Repartidor', $listResp[0]['name']);

        // 4. Toggle activo
        $this->withToken($token)
            ->patchJson("/api/employees/{$employeeId}/toggle-active")
            ->assertOk()
            ->assertJsonPath('is_active', false);

        // 5. Crear pedido asignado al empleado
        $taco = \App\Models\Product::first() ?? \App\Models\Product::create([
            'name' => 'Taco de Papa',
            'price' => 15.0,
            'category' => 'tacos',
            'is_active' => true,
        ]);
        $orderResp = $this->withToken($token)
            ->postJson('/api/orders', [
                'customer_phone' => '3399887766',
                'customer_name' => 'Ana Martínez',
                'delivery_address' => 'Calle Falsa 123',
                'delivery_references' => 'Casa blanca portón negro',
                'delivery_date' => now()->toDateString(),
                'delivery_time' => '15:30',
                'assigned_employee_id' => $employeeId,
                'items' => [
                    [
                        'item_type' => 'product',
                        'product_id' => $taco->id,
                        'product_name' => $taco->name,
                        'quantity' => 15,
                        'is_promo' => false,
                    ],
                ],
            ])
            ->assertStatus(201)
            ->json();

        $orderId = $orderResp['id'];
        $this->assertEquals($employeeId, $orderResp['assigned_employee_id']);

        // 6. Enviar WhatsApp al Cliente
        $waClientResp = $this->withToken($token)
            ->postJson("/api/orders/{$orderId}/whatsapp", [
                'recipient_type' => 'customer',
            ])
            ->assertOk();

        $this->assertTrue($waClientResp->json('success'));
        $this->assertStringContainsString('5213399887766', $waClientResp->json('recipient'));

        // 7. Enviar WhatsApp al Repartidor (Empleado)
        $waEmpResp = $this->withToken($token)
            ->postJson("/api/orders/{$orderId}/whatsapp", [
                'recipient_type' => 'employee',
                'employee_id' => $employeeId,
            ])
            ->assertOk();

        $this->assertTrue($waEmpResp->json('success'));
        $this->assertStringContainsString('5213311223344', $waEmpResp->json('recipient'));

        // 8. Eliminar empleado
        $this->withToken($token)
            ->deleteJson("/api/employees/{$employeeId}")
            ->assertOk();

        $this->assertDatabaseMissing('employees', ['id' => $employeeId]);
    }

    private function authenticate(): string
    {
        return $this->postJson('/api/login', [
            'username' => 'hugo.perez',
            'password' => '12345',
        ])->assertOk()->json('token');
    }
}
