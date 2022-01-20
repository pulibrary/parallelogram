import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MainComponent } from './main/main.component';
import { SettingsComponent } from './settings/settings.component';
import { TopmenuComponent } from './topmenu/topmenu.component';
import { DetailComponent } from './detail/detail.component';

const routes: Routes = [
  { path: '', component: MainComponent },
  { path: 'settings', component: SettingsComponent},
  { path: 'topmenu', component: TopmenuComponent},
  { path: 'detail/:mms_id/:field_id', component: DetailComponent},
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
