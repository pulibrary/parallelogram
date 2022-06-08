## "Parallelogram" Cloud App for Generating Parallel Fields

### Introduction

The "Parallelogram" Cloud App for Alma is used to automatically generate parallel fields in bibliographic records.  It can convert non-roman text to romanized text and vice versa.  To do so, it uses identifiers in the target record (ISBNs, OCLC numbers, etc.) to search for similar records in WorldCat and the Library of Congress Linked Data Service (id.loc.gov).  It examines the parallel fields in these records and uses its findings to generate parallel text in the target record.

The above approach allows the tool to be used for a variety of different languages and scripts without needing detailed information about each language's rules for romanization, capitalization, punctuation, spacing, etc.  (Indeed, some languages do not have consistent "rules" that can easily be automated.)  Though language-independent, it also has some features specific to Chinese, and can be used as a "pinyin converter", similar to the other tools that Princeton University Library has created for [MarcEdit](https://library.princeton.edu/eastasian/addpinyin-plugin-marcedit) and [OCLC Connexion Client](https://library.princeton.edu/eastasian/oclcpinyin).

Because the app is dependent on WorldCat and LOC data, it may not always find the information it needs.  There is a chance that it will not be able to generate parallel text in every case, and the text it does generate is not guaranteed to be accurate.  The tool compensates for this by presenting multiple options for parallel text where there is ambiguity, and also allowing you to correct its suggestions.  Such corrections are saved in the tool's internal database and can be recalled the next time that text appears in a record.  Thus, over time, the tool should produce more consistent and accurate results. 

### Configuration

First of all, please note that depending on your Alma configuration, your administrator may need to enable Cloud Apps for you and allow access to the Parallelogram app.  As you follow the steps below, if you do not see the Cloud Apps menu or an option for Parallelogram in that menu, contact your administrator and request that they enable Alma Cloud Apps, as described in the following documentation from Ex Libris:

https://knowledge.exlibrisgroup.com/Alma/Product_Documentation/010Alma_Online_Help_(English)/050Administration/050Configuring_General_Alma_Functions/Configuring_Cloud_Apps

If you are using the app for anything other than converting Chinese characters to pinyin, then you will need a WorldCat Search API Key.  This can be entered in the settings the first time the app is run.  A catalog administrator can also set the key for all users.  If you do not know your institution's WorldCat API Key, please contact your administrator. If your institution does not have an API Key, they may request one from OCLC at the following website:

https://www.oclc.org/developer/api/oclc-apis/worldcat-search-api.en.html

## Chinese Pinyin Mode

As noted above, the app has a special mode for converting Chinese characters to romanization (pinyin).  If this mode is enabled, then the app will us its internal dictionary to do the conversion, rather than searching WorldCat.  Thus, the app can be run without a WorldCat API Key, and overall it will run more quickly and produce more accurate results.  To enable this mode, go to the app settings, check **"Chinese: Don't Search WorldCat, only convert characters to pinyin"**.  Then, save the settings and click the "Home" button.  Note that you will need to uncheck this setting if you want to use the app for other languages or to convert Chinese romanization to characters.

## Launching the App

Before opening the app, you must first navigate to the bibliographic record you are interested in enhancing.  (Note: the app currently only works with Institution Zone records.)  The record can either be open in the MDE or in read-only mode (what you see if you click the title of the record in a results list).  Alternatively, if you launch the app with a list of search results open, it will select the first record in the list.  To launch the app, open the Cloud Apps Center using this icon in the upper right of the Alma window. 

|<img src="docs/images/screenshot1.png" width=75></img>|
|-|

(If you do not see it, you may need to click the three dots in the upper right of the window, which will show additional options).  Clicking the icon should open the following sidebar on the right side of the screen:

|<img src="docs/images/screenshot2.png" width=300></img>|
|-|

Click the "Parallelogram' entry.  This will launch the app. (You may first need to select it under the "Available Apps" tab and click the "Activate" button before it appears under "Activated Apps".) When the app first opens, you will see all of the data fields in the currently displayed record.  (Control fields are not included in order to simplify the display).

|<img src="docs/images/screenshot3.png" width=700></img>|
|-|

Depending on the app settings, you may need to wait for the app to perform some preliminary steps before you can edit the record.  These include "Searching WorldCat", "Analyzing Records", and "Pre-searching" specific fields.  The screen will go gray and the app will display the progress of these steps.  Once the progress spinner disappears and the screen brightens (as shown in the screenshot above), you can begin editing the record.  If pre-searching is enabled, any fields with successful pre-search results will be displayed in bold.  (See "App Settings" below for an explanation of the pre-searching feature).  To generate a parallel field, click the plus sign icon to the left of the desired field.  The screenshot below shows the result of doing so for fields 245 and 260.

|<img src="docs/images/screenshot4.png" width=700></img>|
|-|

Parallel pairs are displayed next to each other and are highlighted in the same color.  In this case, the app settings indicate that non-roman text should always be put in field 880, so the Japanese text originally in field 245 has been moved to the corresponding 880 field.  However, since field 260 originally contained romanized text, the app simply adds a subfield 6 with a linkage value and generates an 880 with the Japanese text.  (See "App Settings" below for more information about this setting).

After adding all of the desired parallel fields, click the "Save Record" button above the record to save your changes.  To close the app, you can click the X in the upper right of the window or "Back to App List" in the upper left.  Note that you may need to refresh your browser window or the MDE to see your changes reflected in Alma.

***BE SURE TO SAVE THE RECORD BEFORE YOU CLOSE THE APP!  IT WILL NOT WARN YOU IF YOU CLOSE IT WITH UNSAVED WORK!***

### Field Options

Once a field has parallel data, the button to the left turns from a plus into an ellipsis.  Clicking it will open the menu below:

|<img src="docs/images/screenshot5.png" width=100></img>|
|-|

These menu options do the following:

* **edit**: Edit the field (see the section "Editing Subfields" below).
* **swap**: Swap the contents of the parallel fields (except for subfield 6).  This button has the same effect whether you select it for the original field or the 880.
* **unlink**: Removes the link between the two fields without deleting them.  Subfield 6 will be removed from the original field, while in the 880, the occurrence number in subfield 6 will be changed to "00".  This button has the same effect whether you select it for the original field or the 880.
* **delete**:  Deletes the field.  If deleting an 880 field, subfield 6 is also deleted from the original field.  If deleting a non-880 field, the contents of the corresponding 880 are first copied over to the original field, replacing the original field's contents.  Then, subfield 6 of the original field is deleted as well as the entire 880 field.  In other words, when deleting a field, you are actually deleting the contents of the field.  In the end, it is always the 880 field that is removed.

### Editing Subfields

If you select the "edit" option for a given field, the field will expand so that you can edit the subfields, as shown in the screenshot below:

|<img src="docs/images/screenshot6.png" width=700></img>|
|-|

There is one line for each subfield (However, subfields $6 and $0 are not displayed and are not editable).  There are two buttons to the left of each subfield.  The "language" icon displays a list of candidates for that subfield.  In the example above, the app found two CJK transliterations of "Tokyo", so both of these are displayed in the menu.  (Additionally, this menu will always include the original text from the parallel field.)  Selecting one of these candidates will populate the text box with that selection. 

Sometimes, the candidate list will include invalid options.  This may be due to ambiguity or errors in the WorldCat or authority records that are found.  In such a case, the "thumbs down" button will remove the selected text from the candidate list as well as the app's internal database.  (It is still possible that the text could re-appear if a future search encounters the same data.  However, in many cases the thumbs down button is effective in keeping candidate lists from becoming too cluttered).

You can also edit the subfield text directly in the text box.  The app remembers your custom edits and will display them in the candidate list if the same parallel text is encountered in the future.  Clicking the "checkmark" button to the left of the field will save your changes to the subfields and also add any custom text to the app's internal database.    Clicking the "X" button will discard any changes you made to the candidate list or the subfield text.

### App Settings

The screenshot below shows the app settings.  This screen can be accessed by clicking the "Settings" button above the record on the main screen. 

|<img src="docs/images/screenshot7.png" width=700></img>|
|-|

The settings are:

* **Interface Language**: This sets language of the app interface itself (as opposed to the language of the records being edited).
* **WorldCat API Key**: Needed in order to search for WorldCat records.  The Catalog Administrator may choose to populate this field for all users and prevent it from being viewed or edited.  However, if the administrator has not provided an API key, individual users may enter one.  The API Key is not needed if you are only using the app to convert Chinese characters to pinyin.
* **Perform pre-search...**:  If checked, then the app will automatically search for parallel data for the specified fields.  If parallel data is found, the field is displayed in bold type.  Although this takes some extra time when the app is initially opened, it saves the trouble of having to click on a field to see if parallel data was found.  Fields can be removed from the pre-search list by clicking the X next to the tag name.  Additional fields can be added by typing the tag name to the right of the list.  (An 'x' may be used as a wildcard in tag names.)  The more tags in the list, the longer the pre-searching stage will take.  Also, if a tag is not in the pre-search list, it will not be displayed in bold even if that field has parallel data.  The app will not search for this data until you click the plus sign to the left of the field.
* **Give preference to WorldCat records...**: If checked, then the app will give greater weight to parallel text from records originating from specific institutions.  "DLC" (Library of Congress) is included by default, but you can enter any code that may be found in field 040.  This allows you to improve the quality of the parallel text by indicating that certain institutions can be trusted to produce good records.
* **After adding a parallel field, swap original field and 880...**: If checked, this option allows you to set a policy for what kind of text is placed in the 880 field (either roman or non-roman text).  When a parallel field is added, the original and 880 fields are swapped (if needed) to conform to this policy.
* There are two options specific to Chinese:
    - If you are only interested in converting Chinese characters to pinyin (and not vice versa), you can check the **"Don't search WorldCat..."** option.  This will bypass WorldCat searching and generate parallel fields using the app's built-in dictionary.  This is faster and more accurate than using WorldCat.  If this option is checked, the app can be run without a WorldCat API key.
    - If you are processing records that contain Wade-Giles romanization, you can check the **"Search for Pinyin equivalents..."** option, which will convert Wade-Giles text to pinyin and search for both versions of the text.  This makes the app run slightly slower but increases the chances of finding relevant data in WorldCat.
* If the user has the "Catalog Administrator" role, two additional options will appear: 
    - **"Set WorldCat API Key for all users"**.  If checked, then when the settings are saved, the WorldCat API key will automatically be saved to all other users' settings.  This provides an easy way to distribute the WCAPI key.
    - **"Hide WorldCat API Key from other users"**.  If checked, then other users will not be able to see or edit the API Key provided by the administrator.  (The app will still work for regular users, but the API Key will be a hidden setting).  However, if the admin has not provided a key, then other users will still be able to enter their own.
   
After configuring the app's options, click the "Save" button in the upper right.  This will save the settings as well as check the validity of the WorldCat API key.  Click the "Home" button to return to the app's main screen.

### Acknowledgments

Many thanks to those who helped with beta testing the tool and translating the localization files: Ellen Ambrosone, Shuwen Cao, Minjie Chen, Krikor Chobanian, Lia Contursi, Maria Gorbunova, Hyoungbae Lee, and Chiharu Watsky.

