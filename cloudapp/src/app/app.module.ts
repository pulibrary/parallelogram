import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MaterialModule, CloudAppTranslateModule, AlertModule } from '@exlibris/exl-cloudapp-angular-lib';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { MainComponent } from './main/main.component';
import { SettingsComponent } from './settings/settings.component';
import { ConfirmationDialog } from './main/confirmation-dialog';


@NgModule({
  declarations: [
    AppComponent,
    MainComponent,
    SettingsComponent,
    ConfirmationDialog,
  ],
  entryComponents: [
    ConfirmationDialog,
  ],
  imports: [
    MaterialModule,
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    HttpClientModule,
    AlertModule,
    FormsModule,
    ReactiveFormsModule,
    CloudAppTranslateModule.forRoot(),
  ],
  providers: [
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'standard' } },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
