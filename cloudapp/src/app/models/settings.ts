import { Observable, of } from "rxjs";

export class Settings {
    static readonly wcBaseURL: string = "https://nga1cj08ih.execute-api.us-east-2.amazonaws.com/webservices/catalog/search/sru";
    static readonly wcQueryParamName: string = "query";
    static readonly wcOtherParams: string = "&version=1.1&operation=searchRetrieve&recordSchema=info%3Asrw%2Fschema%2F1%2Fmarcxml&maximumRecords=100&startRecord=1&recordPacking=xml&servicelevel=full&sortKeys=relevance&resultSetTTL=300&recordXPath=&frbrGrouping=off"
    wckey: string = "";
    pinyinonly: boolean = false;
    adminWC: boolean = false;
}