# Testing Checklist

## Global App Shell, Auth, Session, Navigation
[] Load the app with no token in localStorage expected result user is redirected to `/login` from protected routes
[] Load the app with a valid token and stored admin payload expected result `getMe` refreshes the admin session and the protected layout renders
[] Load the app with an expired or invalid token expected result token and admin are cleared from localStorage and the browser redirects to `/login`
[] Load the app with a token for a deactivated account expected result the backend returns unauthorized or deactivated and the frontend forces logout
[] Submit login with valid admin credentials expected result success toast appears token and admin are stored and the user lands on `/dashboard`
[] Submit login with valid warden credentials expected result login succeeds and only warden-allowed navigation items appear
[] Submit login with valid security credentials expected result login succeeds and only security-allowed navigation items appear
[] Submit login with invalid username or password expected result login stays on the page and the backend error message is shown
[] Submit login with empty username or empty password expected result browser validation blocks submit
[] Click logout from the header expected result token and admin are removed and the app navigates to `/login`
[] Click logout from the sidebar expected result token and admin are removed and the app navigates to `/login`
[] Open `/dashboard` directly after login expected result the page loads without needing a manual refresh
[] Open `/settings` directly expected result the route redirects to `/admin/settings`
[] Open an unknown route while authenticated expected result the app redirects to `/dashboard`
[] Open an admin-only route as warden or security expected result an access denied or restricted access screen is shown instead of the page
[] Use browser back from the access denied screen expected result the app returns to the previous route without crashing
[] Refresh the browser on each protected route expected result the route remains stable after auth bootstrap finishes
[] Toggle dark mode and refresh expected result the selected theme persists from localStorage
[] Open the app on mobile width and use the hamburger menu expected result the sidebar opens and closes correctly and navigation works
[] Open the app while the socket server is unavailable expected result the shell still loads and shows `Socket Offline` with no fatal error
[] Trigger a 401 from any authenticated API call expected result the global axios interceptor clears auth and redirects to `/login`
[] Lose internet after login and navigate within already-loaded screens expected result the shell stays mounted and individual data areas show resilient failure behavior instead of a blank app

## Layout Alerts And Live Feed
[] Open the alert bell with unread alerts present expected result latest alerts are fetched and unread alerts are marked read
[] Open the alert bell with no alerts expected result an empty state is shown
[] Receive `scan:live` socket events while using the app expected result the live ticker prepends new formatted events and keeps only the most recent five items
[] Receive `scan:blocked`, `scan:unauthorized`, and `scan:warden_required` events expected result the ticker text format remains correct for each event type
[] Open the alert bell while alert fetch fails expected result the shell remains responsive and does not crash

## Dashboard
[] Load dashboard as admin with default `All Campus` filter expected result dashboard cards charts student lists and terminal status load successfully
[] Load dashboard as warden expected result the hostel selector is hidden and the dashboard is automatically scoped to the assigned hostel
[] Change the selected hostel filter as admin expected result dashboard stats charts student groups and hostel metrics refresh to the selected hostel
[] Click each stat card expected result the student list switches between inside outside total students and hostellers outside groups
[] Hide and show the student list expected result the list collapses and expands without losing the selected group
[] Load dashboard when no data is returned expected result the page shows a safe fallback instead of crashing
[] Use `Refresh View` expected result the page refreshes data and the button enters a transient refreshing state
[] Wait for the 30 second auto-refresh expected result the dashboard refreshes without resetting page state unexpectedly
[] Receive a live entry socket event expected result inside and outside counts charts gate activity hostel movement and student group membership update in place
[] Receive a live exit socket event expected result inside and outside counts charts gate activity hostel movement and hostellers outside update in place
[] Receive an unauthorized socket event while on all-campus admin view expected result unauthorized counts and gate activity update
[] Receive an unauthorized socket event while on a hostel-filtered view expected result hostel-scoped dashboard does not incorrectly increment unrelated unauthorized counts
[] Receive a blocked socket event expected result blocked attempt count increments for the matching dashboard scope
[] Receive terminal online and offline socket events expected result terminal status chips and last-seen values update in place
[] Load dashboard with hostels or terminals API failure expected result a visible error toast appears and the screen does not hard crash
[] Load dashboard with a very large student population expected result chart rendering and student table scrolling remain usable

## Dashboard AI Assistant
[] Open the AI widget from the dashboard expected result the chat panel appears with the default welcome message
[] Send a valid supported query like inside count expected result the backend intent endpoint returns a concise answer and it is appended to the conversation
[] Click each suggested example prompt expected result the query is sent once and the bot response is appended
[] Press Enter with a message shorter than three characters expected result nothing is sent
[] Send a query while a previous AI request is still loading expected result duplicate requests are prevented
[] Trigger an AI API failure expected result a fallback bot message is added and a toast indicates the chat request failed
[] Ask unsupported wording expected result the response gracefully states supported monitoring topics
[] Ask an unauthorized count query as warden expected result the answer returns zero rather than leaking unauthorized count data

## Scanner, Barcode, OCR, Manual Entry, Audio
[] Load the scanner page with camera permissions granted expected result barcode mode initializes and the scanner frame renders
[] Load the scanner page with camera permissions denied expected result a clear camera permission error is shown and the page remains usable for manual entry
[] Pause scanning expected result the barcode scanner stops and the paused state UI appears
[] Resume scanning expected result the scanner restarts cleanly without duplicate camera instances
[] Switch from barcode mode to OCR mode expected result OCR initializes camera access and the status message updates
[] Switch repeatedly between barcode and OCR modes expected result the app cleans up camera resources and does not leak scanners or freeze video
[] Unlock scanner audio with first user interaction expected result `audioReady` becomes true and sound playback works
[] Perform a valid authorized scan that should be an entry expected result success toast appears entry sound plays and the last scan card shows student details with entry status
[] Perform a valid authorized scan that should be an exit expected result success toast appears exit sound plays and the last scan card shows exit status
[] Perform two rapid duplicate scans of the same barcode expected result cooldown prevents duplicate processing within the debounce window
[] Scan an unknown SAP ID expected result unauthorized warning sound plays a toast appears and the last scan card shows unauthorized details
[] Scan a blocked student expected result access denied toast appears block reason is shown and the scan is not treated as authorized
[] Scan a hosteller who requires approval but has no active approved request expected result the scan is rejected with warden approval required
[] Scan a hosteller with an approved active request expected result the scan is authorized and later entry marks the request completed correctly
[] Submit manual SAP ID entry with whitespace around the value expected result the value is trimmed before processing
[] Submit manual entry while a scan is already processing expected result duplicate processing is prevented
[] Use OCR when the teal strip is visible expected result OCR reads the SAP ID and submits a scan
[] Use OCR when only a partial 9 to 11 digit number is visible expected result OCR still extracts digits and attempts a scan
[] Use OCR with poor framing or no readable digits expected result status message indicates no digits or partial read without crashing
[] Use OCR manual capture button while auto-scan timer is active expected result the capture still works and does not break the recurring timer
[] Keep the scanner open for an extended period expected result camera and audio remain stable and the page does not progressively slow down

## Scanner Visitor Entry
[] Create a visitor entry with all required fields only expected result the visitor is saved and appears in the recent visitors list
[] Create a visitor entry with optional organization, ID proof, and remarks expected result all provided fields persist and display
[] Submit the visitor form with missing required fields expected result browser validation prevents submission
[] Trigger visitor save API failure expected result an error toast appears and form values are preserved
[] Load recent visitor entries when there are none for the day expected result the empty state text is shown
[] Load recent visitors when the listing API fails expected result the scanner page still works and the failure is logged without blocking scans

## Entry Logs, Visitor Logs, Unauthorized Logs
[] Load entry logs tab with default date expected result entry logs and total count are shown
[] Filter entry logs by SAP ID expected result only matching SAP IDs are shown
[] Filter entry logs by category expected result category aliases and normalized values still return expected rows
[] Filter entry logs by status `entered` expected result only inside logs appear
[] Filter entry logs by status `exited` expected result only exited logs appear
[] Paginate entry logs forward and backward expected result page state changes correctly and buttons disable at boundaries
[] Load visitors tab expected result visitor logs load with pagination and total count
[] Load unauthorized tab as admin or security expected result unauthorized logs and resolved state display correctly
[] Load unauthorized tab as warden expected result the list is empty because the backend suppresses unauthorized visibility for wardens
[] Switch tabs repeatedly expected result loading states and table contents remain consistent and no stale rows bleed between tabs
[] Apply a date filter that has no results expected result each tab shows its empty state
[] Trigger logs API failure expected result the page keeps rendering and does not crash even though no toast is shown

## Analytics
[] Load analytics for today expected result category doughnut weekly trend hourly distribution and campus population charts render
[] Change the analytics date expected result both dashboard stats and hourly data refresh for the selected date
[] Load analytics with a 401 response expected result the page shows the authentication-specific error message unless the global interceptor redirects first
[] Load analytics with a 403 response expected result an access denied error card appears
[] Load analytics with a 500 response expected result a server error card appears with retry controls
[] Load analytics with a network failure expected result a network error card appears with details
[] Click `Retry` on the analytics error card expected result the page reloads
[] Click `Reset Date` on the analytics error card expected result the selected date resets to the current local date
[] Load analytics when no stats are returned expected result the no data warning card appears
[] Open analytics on smaller screens expected result charts remain readable and containers do not overflow badly

## Hosteller Monitoring
[] Load hosteller monitoring as admin expected result total hostellers currently outside and late returns summary cards load
[] Load hosteller monitoring as warden expected result the list is limited to the assigned hostel
[] Switch between `All`, `Outside`, `Late Return`, and `No Activity` filters expected result the table rows update correctly
[] Wait for the 30 second auto-refresh expected result hosteller status updates without losing the selected filter
[] Click refresh expected result the page reloads data manually
[] Load hosteller status when there are no hostellers expected result the empty table state appears
[] Trigger hosteller status API failure expected result the page remains mounted and loading state clears

## Student Management
[] Load student management expected result students and hostels load together and search count matches visible rows
[] Search by student name expected result matching students remain visible
[] Search by SAP ID expected result matching students remain visible
[] Search by email expected result matching students remain visible
[] Open the add student modal expected result the default form values are initialized correctly
[] Create a day scholar with valid required fields expected result the student is created and appears in the table
[] Create a hosteller with hostel selected expected result the student is created with hosteller attributes
[] Attempt to create a hosteller without selecting a hostel expected result client validation prevents save
[] Attempt to create a student with invalid email or invalid parent email expected result client validation prevents save
[] Attempt to create a student with duplicate SAP ID expected result the backend error is shown
[] Use `Create And Open Enrollment` expected result the student is created and navigation goes to `/admin/enrollment?studentId=<id>`
[] Open the edit modal for an existing student expected result current student details populate the form and SAP ID is disabled
[] Change a hosteller to day scholar in edit mode expected result hostel and room fields clear and warden approval becomes false
[] Change an enrolled student’s hostel or type expected result the backend reconciles device allocations and the UI refreshes with updated data
[] Update a nonexistent or deactivated student expected result an error message appears
[] Click refresh expected result the list reloads
[] Search with no matching students expected result the empty state is shown

## Excel Upload Modal
[] Open the Excel upload modal expected result the modal renders with required columns help and template download action
[] Select a non-Excel file expected result the file is rejected with an error toast and no file remains selected
[] Try upload with no file selected expected result an error toast appears
[] Upload a valid Excel file where all rows succeed expected result success count is shown and a success state appears
[] Upload a mixed Excel file with both valid and invalid rows expected result success and failure counts are shown and errors are listed
[] Upload an empty Excel workbook expected result the backend returns an empty file error
[] Upload rows with duplicate SAP IDs expected result the error report shows the duplicate SAP ID failures
[] Upload rows with invalid category or invalid department-course combinations expected result validation errors are surfaced per row
[] Download the template CSV expected result the file downloads with sample headers and rows
[] Download the error report after partial failure expected result a CSV containing row or SAP ID and error details downloads
[] Close and reopen the modal after a previous upload expected result prior selected file and results are reset

## Enrollment
[] Load enrollment as admin expected result students, stats, departments, and hostels all load successfully
[] Load enrollment as non-admin via direct route expected result an admin-only warning is shown
[] Open enrollment with `?studentId=<id>` from student management expected result that student auto-selects and the query param is removed
[] Search and filter students by text expected result the left list updates without losing selection unexpectedly
[] Filter students by `Enrolled`, `Not Enrolled`, `Day Scholar`, and `Hosteller` expected result list results match the selected tab
[] Filter students by department expected result the list only includes that department
[] Select a student and switch between day scholar and hosteller expected result the form updates section B visibility and defaults appropriately
[] Start enrollment without selecting a student expected result a validation toast appears
[] Start enrollment without choosing student type expected result a validation toast appears
[] Start enrollment without entering ZKT user ID expected result a validation toast appears
[] Start enrollment with a duplicate ZKT user ID expected result the backend returns the conflicting student name and SAP ID
[] Start enrollment when machine 50 is not configured with terminal IP expected result a backend error is surfaced
[] Start enrollment successfully expected result the step state moves to `awaiting_scan`
[] Confirm enrollment for a hosteller without hostel or room number expected result validation prevents confirmation
[] Confirm enrollment successfully for a day scholar expected result template is pulled encrypted and the student becomes enrolled
[] Confirm enrollment successfully for a hosteller expected result hostel, room, warden approval, device allocations, and sync all complete
[] Confirm enrollment when terminal sync fails or allocation reconciliation fails expected result the error is shown and the flow does not falsely report success
[] Use `Update Type Without Re-enrollment` on an already enrolled student expected result student type and allocations update without running fingerprint capture again
[] Attempt `Update Type Without Re-enrollment` for a student not yet enrolled expected result client validation blocks the action
[] Refresh enrollment stats expected result card counts update without leaving the screen

## Access Control
[] Load access control as admin expected result summary cards blocked students and unauthorized attempts load
[] Load access control as security expected result read-only access is allowed and block or unblock buttons are hidden
[] Load access control as warden or other unauthorized role expected result an access warning is shown
[] Filter blocked students by department expected result table rows are reduced correctly
[] Filter blocked students by hostel expected result table rows are reduced correctly
[] Filter blocked students by block date expected result only matching blocked dates remain
[] Reset filters expected result the blocked students table returns to the full dataset
[] Block a single student with a standard reason expected result the student moves into blocked state and summary counts update
[] Block a single student with a custom note expected result the final reason includes both reason and note
[] Attempt to block a student who is already blocked expected result the backend returns an already blocked error
[] Bulk block all day scholars expected result only eligible unblocked day scholars are blocked
[] Bulk block all hostellers expected result only eligible unblocked hostellers are blocked
[] Attempt a bulk block when no eligible students remain expected result the backend returns a no eligible students error
[] Unblock a single student with a reason expected result the student is removed from blocked list and an access log entry is created
[] Attempt to unblock a student who is not blocked expected result the backend returns an error
[] Bulk unblock all day scholars expected result only blocked day scholars are unblocked
[] Bulk unblock all hostellers expected result only blocked hostellers are unblocked
[] Expand access history for a blocked student expected result prior block and unblock actions load and blocked attempt noise is excluded
[] Trigger history load failure expected result a toast appears and the page remains usable
[] Receive `scan:blocked` while on the page expected result blocked attempts list updates live and blocked attempt summary increments
[] Receive `scan:unauthorized` while on the page expected result unauthorized attempts list updates live and unauthorized summary increments

## Warden Portal
[] Load the warden portal as admin expected result pending active and history requests load
[] Load the warden portal as warden expected result data is scoped to the assigned hostel
[] Load the warden portal as a warden with no assigned hostel expected result pending, active, and history lists come back empty gracefully
[] Approve a pending request expected result request status changes to approved and it appears under active approvals
[] Reject a pending request with a reason expected result request status changes to rejected and the reason is persisted
[] Attempt reject submit with empty rejection reason expected result validation prevents submit
[] Use bulk approve with several persisted pending requests expected result each real request is approved and live placeholder requests are skipped
[] Receive a live `warden:new_request` socket event expected result a new request appears immediately in the pending list
[] Receive a live `warden:late_return` socket event expected result a late alert banner appears and an error toast is shown
[] View active approvals expected result requests are grouped by hostel and countdowns show urgent or expired styling correctly
[] Wait for the one-minute countdown tick expected result countdown labels update without needing a refresh
[] Filter history by hostel, status, student text, and date expected result only matching records remain
[] Export filtered history to CSV expected result the downloaded file contains only the currently filtered rows
[] Attempt to approve or reject a request from a different hostel as warden expected result the backend returns a hostel access error
[] Load the portal when API calls fail expected result a toast appears and the page remains mounted

## Terminal Management
[] Load the terminal management page as admin expected result terminal summary and grouped terminal cards render
[] Load the page as a non-admin with route access somehow bypassed expected result the page still stays usable but add, edit, and delete actions are hidden
[] Register a new gate terminal with all required fields expected result the terminal is created and appears in the correct gate group
[] Register machine number `50` expected result it is treated as an enrollment station with the correct grouping behavior
[] Register a terminal with no custom label expected result a fallback label is generated
[] Attempt to register a duplicate machine number or duplicate device identity expected result the backend error is surfaced
[] Edit an existing terminal expected result machine number remains locked and updated values persist
[] Delete a terminal after confirming expected result the terminal is removed from the list
[] Cancel terminal deletion in the browser confirm dialog expected result no delete request is made
[] View recent logs for a terminal expected result the merged authorized and unauthorized log table loads in reverse chronological order
[] Open terminal logs for a terminal with no logs expected result the empty state is shown
[] Trigger terminal logs API failure expected result a toast appears and prior logs are cleared
[] Refresh terminal data expected result online or offline counts and terminal details refresh
[] Validate terminal online and offline last-seen formatting expected result both relative and absolute times make sense

## Settings, Hostels, Staff, Notification, Academic, System, Audit
[] Load settings as admin expected result all tabs and bootstrap data load successfully
[] Load settings as non-admin via direct route expected result the admin-only warning is shown
[] Open hostel management with no hostels present expected result the empty state appears
[] Create a hostel with an active warden expected result the hostel is created and that warden becomes assigned
[] Attempt to create a hostel with a non-warden or inactive warden expected result the backend rejects the assignment
[] Edit a hostel and change the assigned warden expected result the new warden assignment persists, previous warden is cleared, and pending hosteller requests are reassigned
[] Deactivate a hostel with active students assigned expected result the backend blocks deactivation
[] Deactivate a hostel with no assigned active students expected result the hostel becomes inactive and disappears from active lists
[] View students for a hostel expected result the side panel shows room, enrollment, and access status for assigned students
[] Trigger hostel students API failure expected result a toast appears and the rest of settings remains usable
[] Create a staff account for admin expected result the account is created and listed as active
[] Create a staff account for warden with assigned hostel expected result the account is created and hostel assignment persists
[] Create a staff account for security expected result the account is created without hostel assignment
[] Attempt to create a staff account with duplicate username expected result the backend returns a duplicate username error
[] Edit staff details without changing username expected result updates persist and no password is required
[] Deactivate another staff account expected result the account becomes inactive and is removed from active warden choices
[] Attempt to deactivate your own account expected result the backend blocks the action
[] Use the settings terminals tab to create, edit, and delete terminals expected result terminal behavior matches the dedicated terminal page
[] Change notification settings and save expected result settings persist after reload
[] Change hostel-specific curfew values and save expected result saved values reload correctly
[] Send a test email with a valid recipient expected result success toast appears
[] Send a test email with no recipient expected result the backend returns recipient required
[] Save academic settings with dates, departments, holidays, and SAP rule expected result values persist after reload
[] Save system configuration with college name, logo, timezone, and maintenance values expected result values persist and tracked public dashboard fields update via socket
[] Trigger system configuration save failure expected result an error toast appears and unsaved changes remain in the form
[] Open audit tab and apply filters by admin, action, and date range expected result audit rows reload to match filters
[] Export audit CSV expected result a dated CSV downloads with the currently loaded audit rows

## Public Live Dashboard
[] Open `/live` with no authentication expected result the public dashboard loads successfully
[] Load the dashboard when branding settings are configured expected result college name and logo display correctly
[] Load the dashboard when branding settings are absent expected result fallback branding text and initials display
[] Load the dashboard when the live API fails expected result a visible failure message appears
[] Receive `scan:live` socket events expected result inside count, live activity, hostel outside counts, and hourly series update in place
[] Receive `scan:unauthorized` socket events expected result unauthorized count and activity feed update in place
[] Receive `scan:blocked` socket events expected result blocked count increments
[] Receive `terminal:online` and `terminal:offline` events expected result terminal badges and last-seen values update
[] Receive `settings:updated` for college name or logo expected result branding updates live without page refresh
[] Open the public dashboard on a narrow mobile screen expected result cards and panels remain readable and scrollable

## Student Exit Request Portal
[] Open `/student/exit-request` as a hosteller with correct name and phone number expected result login succeeds and student profile plus latest request are shown
[] Attempt student login with wrong phone number expected result login fails with an invalid credentials message
[] Attempt student login with a day scholar account expected result login is rejected because only hostellers can use the flow
[] Attempt student login with different casing in the student name expected result case-insensitive matching still succeeds
[] Attempt student login with phone number formatting differences like spaces or dashes expected result normalized comparison still succeeds
[] Login as a hosteller with no hostel assigned expected result login may succeed but request submission is blocked with the hostel assignment message
[] Submit a request with immediate exit and valid expected return time expected result the request is created successfully
[] Submit a request with both requested exit time and expected return time expected result both timestamps persist
[] Submit a request with reason `Other` and additional details expected result the combined reason string is saved
[] Submit a request while the latest request is pending expected result the client blocks duplicate submission
[] Submit a request while the latest request is approved and not completed expected result the client blocks duplicate submission
[] Submit a request with missing expected return time expected result browser validation blocks submit
[] Submit a request with an invalid datetime payload expected result the backend validation returns a helpful error
[] Submit a request when the hostel has no valid active warden assigned expected result the backend rejects the request
[] Reload the page after student login expected result the student session is lost because this flow does not persist auth state
[] Logout from the student portal expected result profile, latest request, and form state are cleared
[] View a rejected latest request expected result the rejection reason card is visible
[] View an approved latest request expected result the approved helper message is visible
[] View the portal with no prior requests expected result the status empty state is visible

## API Failure, Offline, And No Internet Behavior
[] Disconnect internet before loading the login page expected result the login form still renders but authentication requests fail gracefully
[] Disconnect internet before loading dashboard, analytics, settings, enrollment, access control, warden portal, and terminal pages expected result each page shows its loading-to-error behavior without crashing the shell
[] Disconnect internet while the app is already open and socket was connected expected result socket status flips offline and the UI remains usable for non-network interactions
[] Disconnect internet while using barcode or OCR scanning expected result camera UI remains visible but scan requests fail with a scan failed message
[] Disconnect internet while submitting a visitor entry expected result the form remains filled and an error toast appears
[] Disconnect internet while saving settings or mutations expected result save actions surface errors and do not optimistically fake success
[] Disconnect internet while using the public live dashboard expected result socket shows reconnecting state and already-rendered data remains visible

## Performance And Reliability Checkpoints
[] Keep dashboard open through multiple auto-refresh cycles expected result memory usage and responsiveness remain stable
[] Keep hosteller monitoring open through multiple auto-refresh cycles expected result no duplicate timers or repeated network storm occurs
[] Keep scanner open through repeated scans for several minutes expected result no progressive lag in camera preview or sound playback
[] Load student management with hundreds of students expected result search and modal operations remain responsive
[] Load enrollment with 500 students expected result filter changes and student selection remain responsive
[] Open terminal logs and access history repeatedly expected result modal or panel state resets correctly and old data does not flash incorrectly
[] Use the public live dashboard during frequent socket events expected result the live feed remains capped and the page stays scrollable
[] Upload a large Excel sheet expected result the browser stays responsive enough to show progress and the backend returns summarized row results

## Platform And Browser Specific Checks
[] Test barcode scanner on desktop Chrome with webcam expected result preferred camera detection and decoding work
[] Test barcode scanner on Android Chrome expected result the rear camera is chosen when available
[] Test barcode scanner on iPhone Safari expected result camera permission flow and barcode scanning work or fail with a clear message
[] Test OCR scanner on mobile Safari and Chrome expected result camera works and manual capture remains usable
[] Test browser autoplay restrictions on first scanner visit expected result the audio helper text appears until the first interaction unlocks sound
[] Test file upload in major browsers expected result `.xlsx` and `.xls` selection and upload work consistently
[] Test CSV downloads for audit export, hosteller history export, Excel error report, and templates expected result downloads open with correct column structure
