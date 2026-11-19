<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('packages', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('description', 500)->nullable();
            $table->decimal('base_price', 10, 2);
            $table->boolean('is_active')->default(true)->index();
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('package_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('package_id')->constrained('packages')->cascadeOnDelete();
            $table->string('name', 150);
            $table->unsignedInteger('min_quantity')->default(0);
            $table->unsignedInteger('max_quantity');
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('package_group_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('package_group_id')->constrained('package_groups')->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('label', 150);
            $table->decimal('extra_price', 10, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('description', 500)->nullable();
            $table->boolean('applies_to_packages')->default(true);
            $table->unsignedInteger('max_quantity')->default(1);
            $table->json('allowed_options')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->foreignId('package_id')->nullable()->after('product_id')->constrained('packages')->nullOnDelete();
            $table->string('item_type', 30)->default('product')->after('package_id');
            $table->json('package_details')->nullable()->after('promo_reason');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropForeign(['package_id']);
            $table->dropColumn(['package_id', 'item_type', 'package_details']);
        });

        Schema::dropIfExists('promotions');
        Schema::dropIfExists('package_group_options');
        Schema::dropIfExists('package_groups');
        Schema::dropIfExists('packages');
    }
};
