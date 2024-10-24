export class Settings {
    static readonly awsBaseURL: string = "https://nga1cj08ih.execute-api.us-east-2.amazonaws.com/"
    static readonly wcMDBaseURL: string = Settings.awsBaseURL + "worldcat/search/brief-bibs"
    static readonly wcMDSingleBaseURL: string = Settings.awsBaseURL + "worldcat/manage/bibs"
    static readonly wcMDQueryParamName: string = "q"
    static readonly ssLangOptsURL: string = Settings.awsBaseURL + "scriptshifter/table"
    static readonly ssBaseURL: string = Settings.awsBaseURL + "scriptshifter/trans"
    static readonly ssLangURL: string = Settings.awsBaseURL + "scriptshifter/languages"

    static readonly oauthHost: string = "oauth.oclc.org"
    static readonly locHost: string = "id.loc.gov"
    static readonly wcSearchHost: string = "worldcat.org"
    static readonly wcMetadataHost: string = "metadata.api.oclc.org"
    static readonly ssHost: string = "bibframe.org"
   
    wckey: string = "";
    wcsecret: string = "";
    doPresearch: boolean = false;
    doSwap: boolean = false;
    doWCSearch: boolean = undefined;
    pinyinonly: boolean = true;
    swapType: string = "nonroman"
    preSearchList: Array<string> = ["1xx","245","26x","7xx"]
    preferInstitutions: boolean = false;
    preferredInstitutionList: Array<string> = ["DLC"]
    interfaceLang: string = ""
    adminWC: boolean = false;
    adminLock: boolean = false;
    ssLang: string = "none"
    autoSelectSSLang: boolean = true
    ssCapitalize: string = "no_change"
    ssOptionsValues: string = "{}"
}