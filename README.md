# RSWebSync
## Reporting Service Web Sync for Bulk Download and Upload
**RSWebSync** is a web tool to enable bulk download and upload of **Microsoft SQL Server Reporting Service (SSRS)** items. This is a particularly annoying pet peeve of mine for SSRS when working on a project with a lot of reports to be updated. This tool depends on the SSRS REST API, which means that it will be compatible with SSRS 2016 and above only.
## Features
- Bulk download from SSRS to local folder
- Bulk upload from local to SSRS folder 

---
## Download
The main workflow to be done when downloading:
- Enter the **[URL]** in the provided textbox and click **[Load]**.
- The top right corner **[User]** will be updated with the current user.
- The **[Source]** tree will be populated with the list of folders and items under the **[URL]**. 
- Select the items to be downloaded on the **[Source]** tree.
- The **[Sync Root]** textbox will be updated and marked in red on the **[Source]** tree.
- Enter the **[Zip File Name]** in the provided textbox and click **[Download]**.
- Click **[Select Error Only]** if there is any error and click **[Download]** to redo for the errors.
- Click **[Clear]** to go back to the initial state.

---
## Upload
The main workflow to be done when uploading:
- Enter the **[URL]** in the provided textbox and click **[Load]**.
- The top right corner **[User]** will be updated with the current user.
- The **[Destination]** tree will be populated with the list of folders under the **[URL]**. 
- Drop or select the folder to be uploaded on the **[Dropzone]** box.
- The **[Source]** tree will be populated with the list of folders and items under the **[Dropzone]** folder.
- Select the items to be uploaded on the **[Source]** tree.
- The **[Sync Root]** textbox will be updated and marked in red on the **[Source]** tree.
- Toggle **[Send Sync Root]** to include or exclude the **[Sync Root]** folder from the upload.
- Select the folder to be uploaded to on the **[Destination]** tree and click **[Upload]**.
- Click **[Select Error Only]** if there is any error and click **[Upload]** to redo for the errors.
- Click **[Clear]** to go back to the initial state.

---
**NOTE**
The **[Dropzone]** folder selection will only work correctly the first time.

Make sure to either click **[Clear]** or the **[Upload]** link, or just refresh the page before using the **[Dropzone]** again.    

---
## Authentication
Ahh yes, we've been expecting this. You'll have to be authenticated before you can use this. There are a few ways we can do this, and the choice is yours:
1. Update the SSRS settings in SSMS / Reporting Services / Properties / Advanced / User-defined:
  + Set AccessControlAllowCredential to True.
  + Set AccessControlAllowOrigin to this page/site origin.
  + You might need to restart your reporting service afterward.
2. Download and host it locally on the same server as SSRS.
3. Download and host it on another server in the local network and do option 1 for the host server. 
4. For the security conscious, clone the repo and run npm install, audit, then build and do option 2 or 3.
