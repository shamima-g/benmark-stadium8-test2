# Stadium 8 Training Backend

## What is this module for?

This is a backend for a transaction management system with an API interface. It has the capability to upload transaction files, approve and reject transactions, download transaction files as well as handling user login and management

## How do I get set up?

+ **Prerequisites:**

    + SQL Server: 2022	
    + Linx: [6.12.1](https://digiatats.sharepoint.com/Shared%20Documents/Forms/AllItems.aspx?id=%2FShared%20Documents%2FDownloads%2FLinx%206&p=true&ga=1)
    + [Claude Desktop](https://claude.com/download)
        + Login using your Digiata email address (uses Microsoft login)
    + [Visual Studio Code](https://code.visualstudio.com/download)
        + Once installed, go to the extensions menu on the left panel, search for `Claude Code for VS Code` by Anthropic and install it
    + SourceTree: [Installation Instructions](SourceTreeSetup.md)
    + Node.js and npm: [Installation Instructions](NodeSetup.md)
    + [Python](https://www.python.org/downloads/windows/)
        + Under the Stable Releases section, Click the top `Windows installer (64-bit)` link
            + Once downloaded, run the exe
                + Check the `Add python.exe to PATH` checkbox at the bottom and Click `Install Now`

+ **Installation:**

    + [Clone the Repo](HowToCloneARepository.md):
        + Clone the Repo to the following directory:
            + C:\DigiataRepos\DigiataTraining\stadium-8-benchmark-app
    + Database:
        + Open SSMS on your local machine
            + Login using Windows Authentication
                + Open the `Security` folder in the Object Explorer the one below the `Databases` folder (at the same level)
                    + Open the `Logins` folder, then right click on `NT AUTHORITY\SYSTEM` user and click `Properties`
                        + Under the `Server Roles` page, make sure `sysadmin` is checked, then click `OK`

        + Open the **Database Updater Tool** and set the properties as follows:


            | **Property** | **Value** |
            |----------|----------|
            | SQL Update Scripts Folder | C:\DigiataRepos\DigiataTraining\stadium-8-benchmark-app\backend-api\Src\Db |
            | Server | SQL2022 (Or update to your local server name) |
            | Database | **Stadium8Training** |
            | Authentication | Windows |
            | Script Log Table | UpdateScriptLog |

        + Click on **Install Database**

    + Folder Creation:
        + Create the following directory on your local machine
            + C:\DigiataFileProcessing\Test\Input\Backup

    + Linx:
        + Open the Linx solution from the *…\Src\Api* folder
        + Update the Database connection settings if necessary
        + Deploy the solution
        + Start the solution services on the Linx Server
            + Start everything except for the directory watch service!

## How do I use this module?

+ Test the API (and User Login):
    + Navigate to the Swagger pages of the APIs (open in separate tabs): 
        + [Authentication Swagger Page](http://localhost:10010/swagger)
        + [Transaction Management Swagger Page](http://localhost:10005/transactions-api/swagger)
    + On the [Authentication Swagger Page](http://localhost:10010/swagger), click on the `POST /v1/auth/login` endpoint
    + Click on `Try it out` on the top right of the drop down panel
    + Put the extract below into the Request body
    ```json
    {
        "Username": "fileimporter@digiata.com",
        "Password": "Test123"
    }
    ```
    + Click `Execute`
        + This will now log the user in and create a session token in the `UserManagement.[Session]` table
        + This session token is then set as a cookie in your browser (you can view this by right-clicking and selecting `Inspect` on your browser, then go to the `Network` tab, click on the `login` call and look for the `Cookie` Header)
    + Open the tab that has the [Transaction Management Swagger Page](http://localhost:10005/transactions-api/swagger) 
    + Expand the **Get /v1/users**, click **Try it out** on the top right and click **Execute**
    + The response body should be a list of users added by default in the system

+ Test the file import
    + Switch the Directory Watch service ON on the Linx Server
    + Place the Test folder (found in the TestFiles folder in this repository) in the following directory: `C:\DigiataFileProcessing\Test\Input`
    + The directory watch service should pick the file up and import it into the system
    + Switch the directory watch service OFF on the Linx Server (or remember to switch it off when using the upload endpoint on the front end)

+ Endpoints that you will need for implementation of the front end
    + Authentication API (Base URL: http://localhost:10010)
        + POST /v1/auth/login
            + Pass in email and password to get session token for user
        + POST /v1/auth/logout
            + Log the user out and delete the session token
    + Transaction API (Base URL: http://localhost:10005/transactions-api)
        + GET /v1/file-logs
            + This gets the filelogId that you need for the other endpoints
        
        + GET /v1/files/download
            + This downloads the file with FileLogId as input
        
        + POST /v1/files/upload
            + This uploads a file for a specific File Setting
        
        + GET /v1/transactions
            + Retrieves all the imported transactions with their statuses
        
        + POST /v1/transactions/approve
            + Approve a transaction using Id
        
        + POST /v1/transactions/reject
            + Reject a transaction using Id and capture user note

