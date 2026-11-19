<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\MapsSettingsController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PackageController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\PromotionController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['ok' => true, 'app' => 'Tacos Dorados API']));

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Product Catalog
    Route::get('/products', [ProductController::class, 'index']);
    Route::post('/products', [ProductController::class, 'store']);
    Route::put('/products/{product}', [ProductController::class, 'update']);
    Route::patch('/products/{product}/toggle', [ProductController::class, 'toggle']);
    Route::delete('/products/{product}', [ProductController::class, 'destroy']);

    // Packages (Paquetes con topes y opciones)
    Route::get('/packages', [PackageController::class, 'index']);
    Route::post('/packages', [PackageController::class, 'store']);
    Route::put('/packages/{package}', [PackageController::class, 'update']);
    Route::patch('/packages/{package}/toggle', [PackageController::class, 'toggle']);
    Route::delete('/packages/{package}', [PackageController::class, 'destroy']);

    // Promotions (Regalos / Cortesías)
    Route::get('/promotions', [PromotionController::class, 'index']);
    Route::post('/promotions', [PromotionController::class, 'store']);
    Route::put('/promotions/{promotion}', [PromotionController::class, 'update']);
    Route::patch('/promotions/{promotion}/toggle', [PromotionController::class, 'toggle']);
    Route::delete('/promotions/{promotion}', [PromotionController::class, 'destroy']);

    // Customers & Saved Addresses
    Route::get('/customers/by-phone', [CustomerController::class, 'byPhone']);
    Route::get('/customers', [CustomerController::class, 'index']);
    Route::get('/customers/{customer}', [CustomerController::class, 'show']);
    Route::put('/customers/{customer}', [CustomerController::class, 'update']);
    Route::delete('/customers/{customer}/addresses/{address}', [CustomerController::class, 'destroyAddress']);

    // Orders & PDF
    Route::get('/orders/today', [OrderController::class, 'today']);
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/orders/{order}', [OrderController::class, 'show']);
    Route::get('/orders/{order}/pdf', [OrderController::class, 'pdf']);
    Route::patch('/orders/{order}/deliver', [OrderController::class, 'deliver']);

    // Google Maps Settings & Fallback Search
    Route::get('/settings/maps', [MapsSettingsController::class, 'show']);
    Route::put('/settings/maps', [MapsSettingsController::class, 'update']);
    Route::get('/places/fallback-search', [MapsSettingsController::class, 'fallbackSearch']);
});
