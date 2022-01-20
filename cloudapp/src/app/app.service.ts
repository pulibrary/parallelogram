
import { Injectable } from '@angular/core';
import { InitService } from '@exlibris/exl-cloudapp-angular-lib';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AppService {
    private title = new BehaviorSubject<String>('App title');
    private title$ = this.title.asObservable();
    
    constructor(private initService: InitService) {}

    setTitle(title: String) {
        this.title.next(title);
    }
    
    getTitle(): Observable<String> {
        return this.title$;
    }
}