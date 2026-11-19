<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\MapsSettingsController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\ProductController;
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

    // Customers & Saved Addresses
    Route::get('/customers/by-phone', [CustomerController::class, 'byPhone']);
    Route::get('/customers', [CustomerController::class, 'index']);
    Route::get('/customers/{customer}', [CustomerController::class, 'show']);
    Route::put('/customers/{customer}', [CustomerController::class, 'update']);
    Route::delete('/customers/{customer}/addresses/{address}', [CustomerController::class, 'destroyAddress']);

    // Orders
    Route::get('/orders/today', [OrderController::class, 'today']);
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/orders/{order}', [OrderController::class, 'show']);
    Route::patch('/orders/{order}/deliver', [OrderController::class, 'deliver']);

    // Google Maps Settings & Fallback Search
    Route::get('/settings/maps', [MapsSettingsController::class, 'show']);
    Route::put('/settings/maps', [MapsSettingsController::class, 'update']);
    Route::get('/places/fallback-search', [MapsSettingsController::class, 'fallbackSearch']);
});
