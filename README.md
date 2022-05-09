# "Parallelogram" Cloud App for Generating Parallel Fields

### Introduction

The "Parallelogram" Cloud App for Alma is used to automatically generate parallel fields in bibliographic records.  It can convert non-roman text to romanized text and vice versa.  The basic approach it takes is to use identifiers in the target record (ISBNs, OCLC numbers, etc.) to search for similar records in WorldCat and the Library of Congress Linked Data Service (id.loc.gov).  It examines the parallel fields in these records and uses its findings to generate parallel text for the desired fields in the target record.

#### *Advantage*

The above approach allows the tool to be used for a variety of different languages without needing detailed information about each language's rules for romanization, capitalization, punctuation, spacing, etc.  (Indeed, some languages do not have consistent "rules" that can easily be automated.) 

#### *Caveat and solution*

Because the app is dependent on WorldCat and LOC data, it may not always find the information it needs.  There is a chance that it will not be able to generate parallel text in every case, and the text it does generate is not guaranteed to be accurate.  The tool compensates for this by presenting multiple options for parallel text where there is ambiguity, and also allowing you to correct its suggestions.  Such corrections will be saved to the tool's internal database and can be recalled the next time that text appears in a record.  Thus, over time, the tool should produce more consistent and accurate results. 

### The Testing Environment

Once this tool is released to the public, it can be installed easily by any user from the Alma Cloud Apps Center.  However, while it is still in development, running the tool is a bit more involved.  To open the testing environment, do the following:

1. Using Remote Desktop, connect to the computer lib-staff353.princeton.edu, using your own net ID and password.  (This is Tom Ventimiglia's computer.   Only one user can be logged in at a time, so please check with him in advance to arrange a good time).

2. After logging in, double click the desktop icon named "parallelogram.bat".  This will open a terminal window and display some text indicating that it is starting up the program. 

3. After about a minute, a browser window will open displaying the login screen for the Alma sandbox. You will not be able to log in using your usual credentials.  Tom will provide you with credentials specifically for testing.

The testing environment uses the sandbox, not the production version of Alma.  Because of this, the catalog data may not be exactly the same as what is in the public catalog.  (It is based on a snapshot of the catalog from a few months ago).  However, it also means you are free to experiment and change records as you wish without worrying about corrupting the catalog or causing other problems.

### Launching the App

Before opening the app, you must first navigate to the bibliographic record you are interested in enhancing.  The record can either be open in the MDE or in read-only mode (what you see if you click the title of the record in a results list).  Alternatively, if you launch the app with a list of search results open, it will select the first record in the list.  To launch the app, open the Cloud Apps Center using this icon in the upper right of the Alma window. 

![Cloud Apps Icon](docs/images/screenshot1.png)
