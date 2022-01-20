import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AppService } from '../app.service';

@Component({
  selector: 'app-topmenu',
  templateUrl: './topmenu.component.html',
  styleUrls: ['./topmenu.component.scss']
})
export class TopmenuComponent implements OnInit {
  route: Router;
  title: String;

  constructor(private router: Router, private appService: AppService) { 
    this.route = router; 
  }

  ngOnInit() {
    this.appService.getTitle().subscribe(appTitle => this.title = appTitle);
  }

}