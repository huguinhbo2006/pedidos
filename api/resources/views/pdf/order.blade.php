<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Pedido {{ $order->order_number }} - Taquería Mary</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: DejaVu Sans, sans-serif;
      font-size: 11px;
      color: #1f1712;
      margin: 0;
      padding: 18px 22px;
      line-height: 1.4;
    }
    .header-table {
      width: 100%;
      border-bottom: 3px solid #c84b24;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .logo-cell {
      width: 82px;
      vertical-align: middle;
    }
    .logo-cell img {
      width: 72px;
      height: auto;
      border-radius: 8px;
    }
    .brand-cell {
      vertical-align: middle;
      padding-left: 10px;
    }
    .brand-title {
      font-size: 20px;
      font-weight: bold;
      color: #c84b24;
      margin: 0;
    }
    .brand-sub {
      font-size: 10px;
      color: #5e5046;
      margin: 2px 0 0;
    }
    .brand-contact {
      font-size: 10px;
      font-weight: bold;
      color: #15803d;
      margin: 4px 0 0;
    }
    .folio-cell {
      text-align: right;
      vertical-align: middle;
    }
    .folio-box {
      display: inline-block;
      background: #fff2ea;
      border: 1px solid #c84b24;
      border-radius: 6px;
      padding: 6px 10px;
      text-align: right;
    }
    .folio-num {
      font-size: 14px;
      font-weight: bold;
      color: #c84b24;
    }
    .folio-date {
      font-size: 9px;
      color: #5e5046;
    }
    .status-pill {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 9px;
      font-weight: bold;
      background: {{ $order->is_delivered ? '#eaf8ef' : '#fff3db' }};
      color: {{ $order->is_delivered ? '#15803d' : '#9a5406' }};
    }
    .section-box {
      background: #faf6f0;
      border: 1px solid #e8ded2;
      border-radius: 6px;
      padding: 9px 12px;
      margin-bottom: 14px;
    }
    .section-title {
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
      color: #8a796d;
      margin: 0 0 5px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .items-table th {
      background: #1f1712;
      color: #ffffff;
      font-size: 10px;
      text-align: left;
      padding: 7px 8px;
    }
    .items-table td {
      border-bottom: 1px solid #e8ded2;
      padding: 7px 8px;
      vertical-align: top;
    }
    .items-table .right {
      text-align: right;
      white-space: nowrap;
    }
    .items-table .center {
      text-align: center;
    }
    .promo-row {
      background: #fef6e4;
    }
    .promo-badge {
      display: inline-block;
      background: #f59e0b;
      color: #ffffff;
      font-size: 8px;
      font-weight: bold;
      padding: 1px 5px;
      border-radius: 4px;
      margin-left: 4px;
    }
    .pkg-details {
      margin: 4px 0 0 10px;
      padding: 0;
      list-style: none;
      font-size: 9.5px;
      color: #5e5046;
    }
    .pkg-details li {
      margin-bottom: 2px;
    }
    .totals-table {
      width: 48%;
      margin-left: auto;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .totals-table td {
      padding: 5px 8px;
      border-bottom: 1px solid #e8ded2;
    }
    .totals-table .grand td {
      font-size: 14px;
      font-weight: bold;
      color: #c84b24;
      border-top: 2px solid #c84b24;
      border-bottom: none;
      padding-top: 8px;
    }
    .notes-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 8px 11px;
      margin-bottom: 14px;
      font-size: 10px;
    }
    .footer {
      border-top: 1px dashed #d5c7b8;
      padding-top: 8px;
      text-align: center;
      font-size: 9.5px;
      color: #5e5046;
    }
  </style>
</head>
<body>
  <table class="header-table" cellspacing="0" cellpadding="0">
    <tr>
      @if($logoBase64)
        <td class="logo-cell">
          <img src="{{ $logoBase64 }}" alt="Taquería Mary">
        </td>
      @endif
      <td class="brand-cell">
        <div class="brand-title">Taquería Mary</div>
        <div class="brand-sub">AUTÉNTICA COMIDA MEXICANA · HECHO CON AMOR, PARA TI</div>
        <div class="brand-contact">WhatsApp / Tel: 3320536289 · SOLO DOMICILIO</div>
      </td>
      <td class="folio-cell">
        <div class="folio-box">
          <div class="folio-num">{{ $order->order_number }}</div>
          <div class="folio-date">{{ $order->created_at->format('d/m/Y H:i') }}</div>
          <span class="status-pill">{{ $order->is_delivered ? 'ENTREGADO' : 'PENDIENTE' }}</span>
        </div>
      </td>
    </tr>
  </table>

  <div class="section-box">
    <div class="section-title">Datos del Cliente y Entrega</div>
    <div><strong>Cliente:</strong> {{ $order->customer_name }} &nbsp;|&nbsp; <strong>Celular:</strong> {{ $order->customer_phone }}</div>
    <div style="margin-top: 3px;"><strong>Domicilio:</strong> {{ $order->delivery_address }}</div>
    @if($order->delivery_references)
      <div style="margin-top: 3px;"><strong>Referencias:</strong> {{ $order->delivery_references }}</div>
    @endif
  </div>

  @php
    $regularItems = $order->items->where('is_promo', false);
    $promoItems = $order->items->where('is_promo', true);
  @endphp

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 45px;">Cant.</th>
        <th>Concepto y Desglose</th>
        <th class="right" style="width: 85px;">P. Unitario</th>
        <th class="right" style="width: 85px;">Importe</th>
      </tr>
    </thead>
    <tbody>
      @foreach($regularItems as $item)
        <tr>
          <td class="center"><strong>{{ $item->quantity }}x</strong></td>
          <td>
            <strong>{{ $item->product_name }}</strong>
            @if(!empty($item->package_details))
              <ul class="pkg-details">
                @foreach($item->package_details as $detail)
                  <li>
                    • {{ $detail['quantity'] }}x {{ $detail['label'] }}
                    @if(($detail['extra_price'] ?? 0) > 0)
                      (+${{ number_format((float)$detail['extra_price'], 2) }} c/u)
                    @endif
                  </li>
                @endforeach
              </ul>
            @endif
          </td>
          <td class="right">${{ number_format((float)$item->unit_price, 2) }}</td>
          <td class="right"><strong>${{ number_format((float)$item->line_total, 2) }}</strong></td>
        </tr>
      @endforeach

      @foreach($promoItems as $item)
        <tr class="promo-row">
          <td class="center"><strong>{{ $item->quantity }}x</strong></td>
          <td>
            <strong>{{ $item->product_name }}</strong>
            <span class="promo-badge">REGALO / PROMOCIÓN</span>
            @if($item->promo_reason)
              <div style="font-size: 9px; color: #92400e; margin-top: 2px;">{{ $item->promo_reason }}</div>
            @endif
            @if(!empty($item->package_details))
              <ul class="pkg-details">
                @foreach($item->package_details as $detail)
                  <li>• {{ $detail['quantity'] }}x {{ $detail['label'] }}</li>
                @endforeach
              </ul>
            @endif
          </td>
          <td class="right">
            @if($item->unit_price > 0)
              <span style="text-decoration: line-through; color: #8a796d;">${{ number_format((float)$item->unit_price, 2) }}</span>
            @else
              $0.00
            @endif
          </td>
          <td class="right" style="color: #15803d;"><strong>GRATIS ($0.00)</strong></td>
        </tr>
      @endforeach
    </tbody>
  </table>

  @if($order->notes)
    <div class="notes-box">
      <strong>Observaciones del pedido:</strong> {{ $order->notes }}
    </div>
  @endif

  <table class="totals-table">
    <tr>
      <td>Subtotal productos y paquetes:</td>
      <td class="right">${{ number_format((float)$order->subtotal, 2) }}</td>
    </tr>
    @if($order->promo_savings > 0)
      <tr>
        <td style="color: #15803d;">Ahorro en regalos / promociones:</td>
        <td class="right" style="color: #15803d;">-${{ number_format((float)$order->promo_savings, 2) }}</td>
      </tr>
    @endif
    <tr class="grand">
      <td>TOTAL A PAGAR:</td>
      <td class="right">${{ number_format((float)$order->total, 2) }}</td>
    </tr>
  </table>

  <div class="footer">
    ¡Gracias por su preferencia en Taquería Mary! · Pedidos y atención al 3320536289
  </div>
</body>
</html>
