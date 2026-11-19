<?php

namespace Tests\Feature;

use App\Models\Customer;
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

    public function test_product_catalog_crud_and_usage_guard(): void
    {
        $token = $this->authenticate();

        $this->withToken($token)
            ->getJson('/api/products')
            ->assertOk()
            ->assertJsonCount(13);

        $created = $this->withToken($token)
            ->postJson('/api/products', [
                'name' => 'Orden de Tacos Dorados Especiales',
                'category' => 'Tacos Dorados',
                'description' => 'Con aguacate y queso gratinado',
                'price' => 110,
                'is_active' => true,
            ])
            ->assertStatus(201)
            ->json();

        $this->withToken($token)
            ->putJson("/api/products/{$created['id']}", [
                'name' => 'Orden Especial Actualizada',
                'category' => 'Tacos Dorados',
                'description' => 'Con aguacate',
                'price' => 115,
                'is_active' => true,
            ])
            ->assertOk()
            ->assertJsonPath('price', 115);

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

        $tacosPapa = Product::where('name', 'like', '%Papa%')->firstOrFail();
        $refresco = Product::where('name', 'like', '%Refresco%')->firstOrFail();

        // 1. Create first order for a new customer with a paid item + free promo item
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
                        'product_id' => $tacosPapa->id,
                        'quantity' => 2,
                        'is_promo' => false,
                    ],
                    [
                        'product_id' => $refresco->id,
                        'quantity' => 1,
                        'is_promo' => true,
                        'promo_reason' => 'Promoción del día',
                    ],
                ],
            ])
            ->assertStatus(201);

        $expectedSubtotal = round($tacosPapa->price * 2, 2);
        $expectedSavings = round($refresco->price * 1, 2);

        $firstOrderResp
            ->assertJsonPath('customer_phone', '3312345678')
            ->assertJsonPath('customer_name', 'María López')
            ->assertJsonPath('is_delivered', false);

        $this->assertEquals($expectedSubtotal, $firstOrderResp->json('subtotal'));
        $this->assertEquals($expectedSavings, $firstOrderResp->json('promo_savings'));
        $this->assertEquals($expectedSubtotal, $firstOrderResp->json('total'));

        $firstOrderId = $firstOrderResp->json('id');

        // 2. Lookup customer by phone automatically fills name and lists saved address
        $lookup = $this->withToken($token)
            ->getJson('/api/customers/by-phone?phone=3312345678')
            ->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('customer.name', 'María López')
            ->assertJsonCount(1, 'customer.addresses');

        $customerId = $lookup->json('customer.id');

        // 3. Create second order for same customer using a NEW address -> assigns 2nd address to customer
        $secondOrderResp = $this->withToken($token)
            ->postJson('/api/orders', [
                'customer_phone' => '3312345678',
                'customer_name' => 'María López',
                'delivery_address' => 'Calle Hidalgo 420, Centro, Guadalajara',
                'delivery_references' => 'Oficina piso 2',
                'address_label' => 'Trabajo',
                'items' => [
                    [
                        'product_id' => $tacosPapa->id,
                        'quantity' => 1,
                        'is_promo' => false,
                    ],
                ],
            ])
            ->assertStatus(201);

        $secondOrderId = $secondOrderResp->json('id');

        // Same customer now has 2 distinct saved addresses
        $this->assertSame(1, Customer::count());
        $this->withToken($token)
            ->getJson('/api/customers/by-phone?phone=33-1234-5678')
            ->assertOk()
            ->assertJsonPath('customer.id', $customerId)
            ->assertJsonCount(2, 'customer.addresses');

        // 4. Today's orders screen shows both pending orders
        $this->withToken($token)
            ->getJson('/api/orders/today')
            ->assertOk()
            ->assertJsonCount(2, 'orders')
            ->assertJsonPath('summary.pending_count', 2)
            ->assertJsonPath('summary.delivered_count', 0);

        // 5. Confirm delivery on first order -> MUST disappear from today's main screen even though it's from today
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

        // Delivered order still exists in history filter
        $this->withToken($token)
            ->getJson('/api/orders?status=delivered')
            ->assertOk()
            ->assertJsonCount(1);
    }

    public function test_maps_settings_can_be_read_and_updated(): void
    {
        $token = $this->authenticate();

        $this->withToken($token)
            ->getJson('/api/settings/maps')
            ->assertOk()
            ->assertJsonPath('region', 'mx');

        $this->withToken($token)
            ->putJson('/api/settings/maps', [
                'api_key' => 'AIzaTestKey123',
                'region' => 'mx',
            ])
            ->assertOk()
            ->assertJsonPath('has_google_maps_key', true)
            ->assertJsonPath('api_key', 'AIzaTestKey123')
            ->assertJsonPath('source', 'database');
    }

    private function authenticate(): string
    {
        return $this->postJson('/api/login', [
            'username' => 'hugo.perez',
            'password' => '12345',
        ])->assertOk()->json('token');
    }
}
