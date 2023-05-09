import {Component, Inject} from '@angular/core';
import {MAT_DIALOG_DATA} from '@angular/material/dialog';

@Component({
    selector: 'style-confirmation-dialog',
    templateUrl: 'confirmation-dialog.html',
  })
  export class ConfirmationDialog {
    constructor(@Inject(MAT_DIALOG_DATA) public data: {msg: string, yesString: string, noString: string}) {}
  }  
  
