import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MainComponent } from './main/main.component';
import { SettingsComponent } from './settings/settings.component';
import { CanDeactivateGuard } from './main/can-deactivate-guard.service';

const routes: Routes = [
  { path: '', component: MainComponent, canDeactivate:  [CanDeactivateGuard] },
  { path: 'settings', component: SettingsComponent, canDeactivate: [CanDeactivateGuard]},
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule],
  providers: [CanDeactivateGuard]
})
export class AppRoutingModule { }
