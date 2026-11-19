<?php

use App\Models\Product;
use App\Models\Promotion;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->string('type', 30)->default('free_product')->after('description');
            $table->string('target_scope', 30)->default('all_packages')->after('type');
            $table->json('target_package_ids')->nullable()->after('applies_to_packages');
            $table->json('target_product_ids')->nullable()->after('target_package_ids');
            $table->decimal('min_order_amount', 10, 2)->nullable()->after('target_product_ids');
            $table->unsignedInteger('min_quantity')->default(1)->after('min_order_amount');
            $table->json('reward_products')->nullable()->after('allowed_options');
            $table->string('discount_type', 20)->nullable()->after('reward_products');
            $table->decimal('discount_value', 10, 2)->nullable()->after('discount_type');
            $table->decimal('fixed_price', 10, 2)->nullable()->after('discount_value');
            $table->json('combo_items')->nullable()->after('fixed_price');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('promo_discount_amount', 10, 2)->default(0)->after('promo_savings');
            $table->json('applied_promotions')->nullable()->after('promo_discount_amount');
            $table->string('manual_discount_type', 20)->nullable()->after('applied_promotions');
            $table->decimal('manual_discount_value', 10, 2)->default(0)->after('manual_discount_type');
            $table->decimal('manual_discount_amount', 10, 2)->default(0)->after('manual_discount_value');
            $table->string('manual_discount_reason', 150)->nullable()->after('manual_discount_amount');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->foreignId('promotion_id')->nullable()->after('package_id')->constrained('promotions')->nullOnDelete();
        });

        // Backfill existing seeded free-product promotion without deleting any existing data
        $horchata = Product::where('name', 'like', '%Horchata%')->first();
        $jamaica = Product::where('name', 'like', '%Jamaica%')->first();
        $rewardProducts = [];
        if ($horchata) {
            $rewardProducts[] = ['product_id' => $horchata->id, 'label' => $horchata->name];
        }
        if ($jamaica) {
            $rewardProducts[] = ['product_id' => $jamaica->id, 'label' => $jamaica->name];
        }

        Promotion::query()->each(function (Promotion $promo) use ($rewardProducts) {
            $promo->update([
                'type' => 'free_product',
                'target_scope' => $promo->applies_to_packages ? 'all_packages' : 'order_total',
                'reward_products' => ! empty($rewardProducts) ? $rewardProducts : null,
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropForeign(['promotion_id']);
            $table->dropColumn('promotion_id');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'promo_discount_amount',
                'applied_promotions',
                'manual_discount_type',
                'manual_discount_value',
                'manual_discount_amount',
                'manual_discount_reason',
            ]);
        });

        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn([
                'type',
                'target_scope',
                'target_package_ids',
                'target_product_ids',
                'min_order_amount',
                'min_quantity',
                'reward_products',
                'discount_type',
                'discount_value',
                'fixed_price',
                'combo_items',
            ]);
        });
    }
};
