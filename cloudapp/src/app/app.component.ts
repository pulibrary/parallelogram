import { Component } from '@angular/core';
import { AppService } from './app.service';

@Component({
  selector: 'app-root',
  template: '<cloudapp-alert></cloudapp-alert><router-outlet></router-outlet>',
  styles: `cloudapp-alert {
    top: 0;
    bottom: auto;
    position: relative;
  }`
})
export class AppComponent {

  constructor(private appService: AppService) { }

}
