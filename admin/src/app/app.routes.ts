import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { LoginComponent } from './features/login/login.component';
import { ShellComponent } from './layout/shell.component';
import { TodayOrdersComponent } from './features/orders/today-orders.component';
import { NewOrderComponent } from './features/orders/new-order.component';
import { CatalogComponent } from './features/catalog/catalog.component';
import { PackagesAdminComponent } from './features/packages/packages-admin.component';
import { CustomersComponent } from './features/customers/customers.component';
import { WhatsappDevicesComponent } from './features/whatsapp/whatsapp-devices.component';
import { HistoryComponent } from './features/orders/history.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard],
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'pedidos', pathMatch: 'full' },
      { path: 'pedidos', component: TodayOrdersComponent },
      { path: 'pedidos/nuevo', component: NewOrderComponent },
      { path: 'pedidos/editar/:id', component: NewOrderComponent },
      { path: 'catalogo', component: CatalogComponent },
      { path: 'paquetes', component: PackagesAdminComponent },
      { path: 'clientes', component: CustomersComponent },
      { path: 'whatsapp', component: WhatsappDevicesComponent },
      { path: 'historial', component: HistoryComponent },
    ],
  },
  { path: '**', redirectTo: 'pedidos' },
];
