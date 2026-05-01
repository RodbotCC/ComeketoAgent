\# Close \| Developer API Documentation

\## Docs

\- \[Close Developer Platform\](https://developer.close.com/.mdx): Build integrations, automate workflows, and extend Close for your team.
\- \[Build an Integration\](https://developer.close.com/integrations.md): Connect your product or internal tools with Close.
\- \[Creating an OAuth App\](https://developer.close.com/integrations/create-an-oauth-app.mdx): Register your application in Close to get OAuth client credentials.
\- \[Publish\](https://developer.close.com/integrations/publish.md): Make your OAuth app public and get listed in the Close Integrations Directory.
\- \[API Overview\](https://developer.close.com/api/overview.md): Key concepts for working with the Close REST API.
\- \[Authentication with API keys\](https://developer.close.com/api/overview/api-key-authentication.md): How to authenticate Close API requests using API keys with HTTP Basic Auth.
\- \[Authentication with OAuth\](https://developer.close.com/api/overview/oauth-authentication.md): How to register an OAuth 2.0 application and authenticate users with the Close API.
\- \[API Clients\](https://developer.close.com/api/overview/api-clients.md): Community-built API client libraries for Python, PHP, Node.js, Ruby, Go, and C#.
\- \[Pagination\](https://developer.close.com/api/overview/pagination.md): How to paginate through Close API results using offset-based and cursor-based pagination.
\- \[Specifying Fields\](https://developer.close.com/api/overview/fields.md): Control which fields are returned in responses and how to update only specific fields.
\- \[Filter Parameters\](https://developer.close.com/api/overview/filter-parameters.md): How to pass filter parameters via query strings or JSON request body to avoid URL length limits.
\- \[HTTP Response Codes\](https://developer.close.com/api/overview/http-response-codes.md): HTTP status codes returned by the Close API and what they mean.
\- \[Rate Limits\](https://developer.close.com/api/overview/rate-limits.md): Close API rate limit policies and how to handle 429 Too Many Requests responses.
\- \[Timezone Offsets\](https://developer.close.com/api/overview/timezone-offsets.md): Use the x-tz-offset header to pass your timezone
\- \[Rich Text Fields\](https://developer.close.com/api/overview/rich-text.md): How rich text fields work in the Close API, including supported HTML tags and formatting.
\- \[API Changelog\](https://developer.close.com/api/overview/changelog.mdx)
\- \[Leads\](https://developer.close.com/api/resources/leads.md): Leads are the most important object in Close.
\- \[Contacts\](https://developer.close.com/api/resources/contacts.md): Contacts represent individual people within a company/organization that you're selling to
\- \[Opportunities\](https://developer.close.com/api/resources/opportunities.md): Opportunities represent a potential deal with a given company/lead
\- \[Tasks\](https://developer.close.com/api/resources/tasks.md): Tasks are action items with a given date that are assigned to a sales rep
\- \[Files\](https://developer.close.com/api/resources/files.md): Upload files to attach to outgoing emails or other objects via the API.
\- \[Custom Object Types\](https://developer.close.com/api/resources/custom-objects.md): Create custom object types with user-defined fields.
\- \[Comments\](https://developer.close.com/api/resources/comments.md): Comments may be left on a variety of object types in Close
\- \[Activities\](https://developer.close.com/api/resources/activities.md): Represent any type of activity performed on a Lead or its Contacts.
\- \[Notes\](https://developer.close.com/api/resources/activities/notes.md): A Note is a freeform text activity on a Lead
\- \[Calls\](https://developer.close.com/api/resources/activities/calls.md): Call activities track inbound and outbound phone calls on a Lead.
\- \[Emails\](https://developer.close.com/api/resources/activities/emails.md): Email activities represent individual emails sent to or received from a lead/contact.
\- \[Email Threads\](https://developer.close.com/api/resources/activities/email-threads.md): Email Threads are a collection of Email activities belonging to the same thread
\- \[WhatsApp Messages\](https://developer.close.com/api/resources/activities/whatsapp.md): WhatsApp Message activities represent messages from external WhatsApp integrations.
\- \[Meetings\](https://developer.close.com/api/resources/activities/meetings.md): A Meeting activity represents a calendar event synced from Google Calendar or Microsoft Outlook, or created manually
\- \[Meeting Search\](https://developer.close.com/api/resources/activities/meetings/search.md): Search meetings by provider calendar information such as event ID, calendar ID, or account ID.
\- \[Custom Activities\](https://developer.close.com/api/resources/activities/custom-activities.md): Create custom activity types with user-defined fields to track any kind of interaction.
\- \[Created\](https://developer.close.com/api/resources/activities/creations.md): Created activities denote the time and method by which a lead was created
\- \[Form Submission\](https://developer.close.com/api/resources/activities/form-submissions.md): A FormSubmission activity is created automatically when someone submits a form through Close forms.
\- \[Lead Status Changes\](https://developer.close.com/api/resources/activities/lead-status-changes.md): Lead Status Change activities are created when you change the status of a Lead
\- \[Opportunity Status Changes\](https://developer.close.com/api/resources/activities/opportunity-status-changes.md): Opportunity Status Change activities are created when you change an Opportunity's status
\- \[Lead Merges\](https://developer.close.com/api/resources/activities/lead-merges.md): LeadMerge activities are created when you merge one lead into another.
\- \[Task Completed\](https://developer.close.com/api/resources/activities/task-completions.md): Task Completed activities are created when you complete a task on a lead
\- \[Webhooks\](https://developer.close.com/api/resources/webhooks.md): Configure webhook subscriptions to receive real-time event notifications from Close.
\- \[Webhook Filters\](https://developer.close.com/api/resources/webhooks/webhook-filters.md): Use JSON event filters to apply advanced filtering logic to webhook subscriptions.
\- \[Event Log\](https://developer.close.com/api/resources/events.md): Access the Close event log API to track changes to objects over the last 30 days.
\- \[List of Event Types\](https://developer.close.com/api/resources/events/list-of-event-types.md): Complete list of event log actions grouped by object type, including leads, contacts, activities, and more.
\- \[Advanced Filtering\](https://developer.close.com/api/resources/advanced-filtering.md): Use the Advanced Filtering API to find Leads or Contacts matching arbitrary filter criteria.
\- \[Smart Views\](https://developer.close.com/api/resources/smart-views.md): Smart Views are "saved search queries" in Close and show up in the sidebar in the UI.
\- \[Reporting\](https://developer.close.com/api/resources/reporting.md): These endpoints return aggregated and per-user data used by the Reporting features of Close.
\- \[Sequences\](https://developer.close.com/api/resources/sequences.md): A series of automated steps performed on subscribers until they reply.
\- \[Bulk Actions\](https://developer.close.com/api/resources/bulk-actions.md): Perform bulk operations on leads matching a search query or smart view.
\- \[Exports\](https://developer.close.com/api/resources/exports.md): Export data out of Close.
\- \[Field Enrichment\](https://developer.close.com/api/resources/field-enrichment.md): Field Enrichment uses AI to intelligently populate fields on leads and contacts
\- \[Custom Fields\](https://developer.close.com/api/resources/custom-fields.md): Store arbitrary data on Leads, Contacts, Opportunities, and Custom Activities using Custom Fields.
\- \[Custom Field Schemas\](https://developer.close.com/api/resources/custom-fields/custom-field-schemas.md): Returns all Custom Fields for a given object type in the order you have defined.
\- \[Shared\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared.md): Shared Custom Fields can be associated with multiple object types.
\- \[Pipelines\](https://developer.close.com/api/resources/pipelines.md): Pipelines are named and ordered groups of \[Opportunity Statuses\](/api/resources/opportunity-statuses).
\- \[Opportunity Statuses\](https://developer.close.com/api/resources/opportunity-statuses.md): Customizable list of stages an Opportunity can be in.
\- \[Lead Statuses\](https://developer.close.com/api/resources/lead-statuses.md): Lead statuses are a \[customizable\](https://help.close.com/docs/lead-statuses) list of stages a Lead can be in
\- \[Integration Links\](https://developer.close.com/api/resources/integration-links.md): Custom links that appear on Lead, Contact, or Opportunity pages in Close.
\- \[Email Templates\](https://developer.close.com/api/resources/email-templates.md): Predefined emails that can be reused in the Close UI or Bulk Email.
\- \[SMS Templates\](https://developer.close.com/api/resources/sms-templates.md): SMS Templates are predefined messages that can be reused when sending SMS via the Close UI
\- \[Outcomes\](https://developer.close.com/api/resources/outcomes.md): Outcomes represent standardized results that can be applied to activities such as calls and meetings.
\- \[Scheduling Links\](https://developer.close.com/api/resources/scheduling-links-guide.md): Create and manage scheduling links for booking meetings directly from Close.
\- \[Scheduling Links\](https://developer.close.com/api/resources/scheduling-links.md): Close users can embed scheduling links in their communications sent through Close
\- \[Connected Accounts\](https://developer.close.com/api/resources/connected-accounts.md): Manage Email, Zoom, Microsoft, and Calendly accounts connected to Close.
\- \[Send As\](https://developer.close.com/api/resources/send-as.md): Allow a user to send emails on behalf of another user.
\- \[Unsubscribed Emails\](https://developer.close.com/api/resources/unsubscribed-emails.md): Unsubscribe email addresses from receiving messages from Close
\- \[Phone Numbers\](https://developer.close.com/api/resources/phone-numbers.md): This endpoint shows you all the phone numbers that exist in your organization and lets you rent new numbers.
\- \[Blocked Phone Numbers\](https://developer.close.com/api/resources/blocked-phone-numbers.md): Manage phone numbers that are blocked from calling and messaging in your organization.
\- \[Dialer\](https://developer.close.com/api/resources/dialers.md): Automatically call each lead or contact in a Smart View or Shared Entry.
\- \[Users\](https://developer.close.com/api/resources/users.md): Users represent Close user accounts, usually your co-workers / sales reps inside your company/organization
\- \[Organizations\](https://developer.close.com/api/resources/organizations.md): Organizations are "environments" in Close where your team works.
\- \[Memberships\](https://developer.close.com/api/resources/memberships.md): Memberships connect a User with one or more Organizations.
\- \[Roles\](https://developer.close.com/api/resources/roles.md): \[Roles\](https://help.close.com/docs/roles-permissions) define what users in your organization can or cannot do
\- \[Groups\](https://developer.close.com/api/resources/groups.md): Groups are named collections of \[Users\](/api/resources/users).
\- \[Close MCP Server\](https://developer.close.com/mcp.mdx)
\- \[Close MCP Tools\](https://developer.close.com/mcp/tools.mdx)

\## API Docs

\- API Endpoints > CRM Core > Leads \[List Leads\](https://developer.close.com/api/resources/leads/list.mdx)
\- API Endpoints > CRM Core > Leads \[Create a new lead\](https://developer.close.com/api/resources/leads/create.mdx)
\- API Endpoints > CRM Core > Leads \[Merge two leads\](https://developer.close.com/api/resources/leads/merge.mdx)
\- API Endpoints > CRM Core > Leads \[Get a single Lead\](https://developer.close.com/api/resources/leads/get.mdx)
\- API Endpoints > CRM Core > Leads \[Update an existing lead\](https://developer.close.com/api/resources/leads/update.mdx)
\- API Endpoints > CRM Core > Leads \[Delete a lead\](https://developer.close.com/api/resources/leads/delete.mdx)
\- API Endpoints > CRM Core > Contacts \[List contacts\](https://developer.close.com/api/resources/contacts/list.mdx)
\- API Endpoints > CRM Core > Contacts \[Create a new contact\](https://developer.close.com/api/resources/contacts/create.mdx)
\- API Endpoints > CRM Core > Contacts \[Fetch a single contact\](https://developer.close.com/api/resources/contacts/get.mdx)
\- API Endpoints > CRM Core > Contacts \[Update an existing contact\](https://developer.close.com/api/resources/contacts/update.mdx)
\- API Endpoints > CRM Core > Contacts \[Delete a contact\](https://developer.close.com/api/resources/contacts/delete.mdx)
\- API Endpoints > CRM Core > Opportunities \[List or filter opportunities\](https://developer.close.com/api/resources/opportunities/list.mdx)
\- API Endpoints > CRM Core > Opportunities \[Create an opportunity\](https://developer.close.com/api/resources/opportunities/create.mdx)
\- API Endpoints > CRM Core > Opportunities \[Retrieve an opportunity\](https://developer.close.com/api/resources/opportunities/get.mdx)
\- API Endpoints > CRM Core > Opportunities \[Update an opportunity\](https://developer.close.com/api/resources/opportunities/update.mdx)
\- API Endpoints > CRM Core > Opportunities \[Delete an opportunity\](https://developer.close.com/api/resources/opportunities/delete.mdx)
\- API Endpoints > CRM Core > Tasks \[List or filter tasks\](https://developer.close.com/api/resources/tasks/list.mdx)
\- API Endpoints > CRM Core > Tasks \[Create a task\](https://developer.close.com/api/resources/tasks/create.mdx)
\- API Endpoints > CRM Core > Tasks \[Bulk-update tasks\](https://developer.close.com/api/resources/tasks/bulk-update.mdx)
\- API Endpoints > CRM Core > Tasks \[Fetch a task's details\](https://developer.close.com/api/resources/tasks/get.mdx)
\- API Endpoints > CRM Core > Tasks \[Update a task\](https://developer.close.com/api/resources/tasks/update.mdx)
\- API Endpoints > CRM Core > Tasks \[Delete a task\](https://developer.close.com/api/resources/tasks/delete.mdx)
\- API Endpoints > CRM Core > Files \[Generate a signed S3 POST\](https://developer.close.com/api/resources/files/create.mdx)
\- API Endpoints > CRM Core > Custom Objects \[List Custom Object instances\](https://developer.close.com/api/resources/custom-objects/list.mdx)
\- API Endpoints > CRM Core > Custom Objects \[Create a new Custom Object instance\](https://developer.close.com/api/resources/custom-objects/create.mdx)
\- API Endpoints > CRM Core > Custom Objects \[Retrieve a single Custom Object instance\](https://developer.close.com/api/resources/custom-objects/get.mdx)
\- API Endpoints > CRM Core > Custom Objects \[Updating a Custom Object instance\](https://developer.close.com/api/resources/custom-objects/update.mdx)
\- API Endpoints > CRM Core > Custom Objects \[Delete a Custom Object instance\](https://developer.close.com/api/resources/custom-objects/delete.mdx)
\- API Endpoints > CRM Core > Comments \[Fetch multiple comments\](https://developer.close.com/api/resources/comments/list.mdx)
\- API Endpoints > CRM Core > Comments \[Create a Comment\](https://developer.close.com/api/resources/comments/create.mdx)
\- API Endpoints > CRM Core > Comments \[Fetch an individual comment\](https://developer.close.com/api/resources/comments/get.mdx)
\- API Endpoints > CRM Core > Comments \[Update a Comment\](https://developer.close.com/api/resources/comments/update.mdx)
\- API Endpoints > CRM Core > Comments \[Remove a comment\](https://developer.close.com/api/resources/comments/delete.mdx)
\- API Endpoints > CRM Core > Comments \[Fetch multiple comment threads\](https://developer.close.com/api/resources/comments/list-threads.mdx)
\- API Endpoints > CRM Core > Comments \[Fetch an individual comment thread\](https://developer.close.com/api/resources/comments/get-thread.mdx)
\- API Endpoints > Activities > Activities \[List or filter all activity types\](https://developer.close.com/api/resources/activities/list.mdx)
\- API Endpoints > Activities > Notes \[List or filter all Note activities\](https://developer.close.com/api/resources/activities/notes/list.mdx)
\- API Endpoints > Activities > Notes \[Create a Note activity\](https://developer.close.com/api/resources/activities/notes/create.mdx)
\- API Endpoints > Activities > Notes \[Get a single Note activity\](https://developer.close.com/api/resources/activities/notes/get.mdx)
\- API Endpoints > Activities > Notes \[Update a Note activity\](https://developer.close.com/api/resources/activities/notes/update.mdx)
\- API Endpoints > Activities > Notes \[Delete a Note activity\](https://developer.close.com/api/resources/activities/notes/delete.mdx)
\- API Endpoints > Activities > Calls \[List or filter all Call activities\](https://developer.close.com/api/resources/activities/calls/list.mdx)
\- API Endpoints > Activities > Calls \[Log an external Call activity\](https://developer.close.com/api/resources/activities/calls/create.mdx)
\- API Endpoints > Activities > Calls \[Get a single Call activity\](https://developer.close.com/api/resources/activities/calls/get.mdx)
\- API Endpoints > Activities > Calls \[Update a Call activity\](https://developer.close.com/api/resources/activities/calls/update.mdx)
\- API Endpoints > Activities > Calls \[Delete a Call activity\](https://developer.close.com/api/resources/activities/calls/delete.mdx)
\- API Endpoints > Activities > Emails \[List or filter all Email activities\](https://developer.close.com/api/resources/activities/emails/list.mdx)
\- API Endpoints > Activities > Emails \[Create an Email activity\](https://developer.close.com/api/resources/activities/emails/create.mdx)
\- API Endpoints > Activities > Emails \[Get a single Email activity\](https://developer.close.com/api/resources/activities/emails/get.mdx)
\- API Endpoints > Activities > Emails \[Update an Email activity\](https://developer.close.com/api/resources/activities/emails/update.mdx)
\- API Endpoints > Activities > Emails \[Delete an Email activity\](https://developer.close.com/api/resources/activities/emails/delete.mdx)
\- API Endpoints > Activities > Email Threads \[List or filter all EmailThread activities\](https://developer.close.com/api/resources/activities/email-threads/list.mdx)
\- API Endpoints > Activities > Email Threads \[Get a single EmailThread activity\](https://developer.close.com/api/resources/activities/email-threads/get.mdx)
\- API Endpoints > Activities > Email Threads \[Delete an EmailThread activity\](https://developer.close.com/api/resources/activities/email-threads/delete.mdx)
\- API Endpoints > Activities > SMS \[List or filter all SMS activities\](https://developer.close.com/api/resources/activities/sms/list.mdx)
\- API Endpoints > Activities > SMS \[Create an SMS activity\](https://developer.close.com/api/resources/activities/sms/create.mdx)
\- API Endpoints > Activities > SMS \[Get a single SMS activity\](https://developer.close.com/api/resources/activities/sms/get.mdx)
\- API Endpoints > Activities > SMS \[Update an SMS activity\](https://developer.close.com/api/resources/activities/sms/update.mdx)
\- API Endpoints > Activities > SMS \[Delete an SMS activity\](https://developer.close.com/api/resources/activities/sms/delete.mdx)
\- API Endpoints > Activities > WhatsApp Messages \[List or filter all WhatsAppMessage activities\](https://developer.close.com/api/resources/activities/whatsapp/list.mdx)
\- API Endpoints > Activities > WhatsApp Messages \[Create a WhatsAppMessage activity\](https://developer.close.com/api/resources/activities/whatsapp/create.mdx)
\- API Endpoints > Activities > WhatsApp Messages \[Get a single WhatsAppMessage activity\](https://developer.close.com/api/resources/activities/whatsapp/get.mdx)
\- API Endpoints > Activities > WhatsApp Messages \[Update a WhatsAppMessage activity\](https://developer.close.com/api/resources/activities/whatsapp/update.mdx)
\- API Endpoints > Activities > WhatsApp Messages \[Delete a WhatsAppMessage activity\](https://developer.close.com/api/resources/activities/whatsapp/delete.mdx)
\- API Endpoints > Activities > Meetings \[List or filter all Meeting activities\](https://developer.close.com/api/resources/activities/meetings/list.mdx)
\- API Endpoints > Activities > Meetings \[Get a single Meeting activity\](https://developer.close.com/api/resources/activities/meetings/get.mdx)
\- API Endpoints > Activities > Meetings \[Update a Meeting activity\](https://developer.close.com/api/resources/activities/meetings/update.mdx)
\- API Endpoints > Activities > Meetings \[Delete a Meeting activity\](https://developer.close.com/api/resources/activities/meetings/delete.mdx)
\- API Endpoints > Activities > Meetings \[Create or update third-party Meeting integration\](https://developer.close.com/api/resources/activities/meetings/create-integration.mdx)
\- API Endpoints > Activities > Custom Activities \[List or filter all Custom Activity instances\](https://developer.close.com/api/resources/activities/custom-activities/list.mdx)
\- API Endpoints > Activities > Custom Activities \[Create a new Custom Activity instance\](https://developer.close.com/api/resources/activities/custom-activities/create.mdx)
\- API Endpoints > Activities > Custom Activities \[Get a single Custom Activity instance\](https://developer.close.com/api/resources/activities/custom-activities/get.mdx)
\- API Endpoints > Activities > Custom Activities \[Updating a Custom Activity instance\](https://developer.close.com/api/resources/activities/custom-activities/update.mdx)
\- API Endpoints > Activities > Custom Activities \[Delete a Custom Activity instance\](https://developer.close.com/api/resources/activities/custom-activities/delete.mdx)
\- API Endpoints > Activities > Creations \[List or filter all Created activities\](https://developer.close.com/api/resources/activities/creations/list.mdx)
\- API Endpoints > Activities > Creations \[Get a single Created activity\](https://developer.close.com/api/resources/activities/creations/get.mdx)
\- API Endpoints > Activities > Form Submissions \[List or filter all FormSubmission activities\](https://developer.close.com/api/resources/activities/form-submissions/list.mdx)
\- API Endpoints > Activities > Form Submissions \[Get a single FormSubmission activity\](https://developer.close.com/api/resources/activities/form-submissions/get.mdx)
\- API Endpoints > Activities > Form Submissions \[Delete a FormSubmission activity\](https://developer.close.com/api/resources/activities/form-submissions/delete.mdx)
\- API Endpoints > Activities > Lead Status Changes \[List or filter all LeadStatusChange activities\](https://developer.close.com/api/resources/activities/lead-status-changes/list.mdx)
\- API Endpoints > Activities > Lead Status Changes \[Create a new LeadStatusChange activity\](https://developer.close.com/api/resources/activities/lead-status-changes/create.mdx)
\- API Endpoints > Activities > Lead Status Changes \[Get a single LeadStatusChange activity\](https://developer.close.com/api/resources/activities/lead-status-changes/get.mdx)
\- API Endpoints > Activities > Lead Status Changes \[Delete a single LeadStatusChange activity\](https://developer.close.com/api/resources/activities/lead-status-changes/delete.mdx)
\- API Endpoints > Activities > Opportunity Status Changes \[List or filter all OpportunityStatusChange activities\](https://developer.close.com/api/resources/activities/opportunity-status-changes/list.mdx)
\- API Endpoints > Activities > Opportunity Status Changes \[Create a new OpportunityStatusChange activity\](https://developer.close.com/api/resources/activities/opportunity-status-changes/create.mdx)
\- API Endpoints > Activities > Opportunity Status Changes \[Get a single OpportunityStatusChange activity\](https://developer.close.com/api/resources/activities/opportunity-status-changes/get.mdx)
\- API Endpoints > Activities > Opportunity Status Changes \[Delete a single OpportunityStatusChange activity\](https://developer.close.com/api/resources/activities/opportunity-status-changes/delete.mdx)
\- API Endpoints > Activities > Lead Merges \[List or filter all LeadMerge activities\](https://developer.close.com/api/resources/activities/lead-merges/list.mdx)
\- API Endpoints > Activities > Lead Merges \[Get a single LeadMerge activity\](https://developer.close.com/api/resources/activities/lead-merges/get.mdx)
\- API Endpoints > Activities > Task Completions \[List or filter all TaskCompleted activities\](https://developer.close.com/api/resources/activities/task-completions/list.mdx)
\- API Endpoints > Activities > Task Completions \[Get a single TaskCompleted activity\](https://developer.close.com/api/resources/activities/task-completions/get.mdx)
\- API Endpoints > Activities > Task Completions \[Delete a TaskCompleted activity\](https://developer.close.com/api/resources/activities/task-completions/delete.mdx)
\- API Endpoints > Events & Webhooks > Webhooks \[List Webhook subscriptions\](https://developer.close.com/api/resources/webhooks/list.mdx)
\- API Endpoints > Events & Webhooks > Webhooks \[Create new Webhook subscription\](https://developer.close.com/api/resources/webhooks/create.mdx)
\- API Endpoints > Events & Webhooks > Webhooks \[Retrieve a single Webhook subscription\](https://developer.close.com/api/resources/webhooks/get.mdx)
\- API Endpoints > Events & Webhooks > Webhooks \[Update existing Webhook subscription\](https://developer.close.com/api/resources/webhooks/update.mdx)
\- API Endpoints > Events & Webhooks > Webhooks \[Delete Webhook subscription\](https://developer.close.com/api/resources/webhooks/delete.mdx)
\- API Endpoints > Events & Webhooks > Events \[Retrieve a list of events\](https://developer.close.com/api/resources/events/list.mdx)
\- API Endpoints > Events & Webhooks > Events \[Retrieve a single event by ID\](https://developer.close.com/api/resources/events/get.mdx)
\- API Endpoints > Search & Reporting > Smart Views \[List Smart Views\](https://developer.close.com/api/resources/smart-views/list.mdx)
\- API Endpoints > Search & Reporting > Smart Views \[Create a Smart View\](https://developer.close.com/api/resources/smart-views/create.mdx)
\- API Endpoints > Search & Reporting > Smart Views \[Get a single Smart View\](https://developer.close.com/api/resources/smart-views/get.mdx)
\- API Endpoints > Search & Reporting > Smart Views \[Update a Smart View\](https://developer.close.com/api/resources/smart-views/update.mdx)
\- API Endpoints > Search & Reporting > Smart Views \[Delete a Smart View\](https://developer.close.com/api/resources/smart-views/delete.mdx)
\- API Endpoints > Search & Reporting > Reporting \[Get an activity report\](https://developer.close.com/api/resources/reporting/get-activity.mdx)
\- API Endpoints > Search & Reporting > Reporting \[List the predefined metrics used in activity reports\](https://developer.close.com/api/resources/reporting/list-activity-metrics.mdx)
\- API Endpoints > Search & Reporting > Reporting \[Get custom report (Explorer)\](https://developer.close.com/api/resources/reporting/get-custom.mdx)
\- API Endpoints > Search & Reporting > Reporting \[Get a funnel report (stages)\](https://developer.close.com/api/resources/reporting/get-funnel-stages.mdx)
\- API Endpoints > Search & Reporting > Reporting \[Get a funnel report (totals)\](https://developer.close.com/api/resources/reporting/get-funnel-totals.mdx)
\- API Endpoints > Search & Reporting > Reporting \[Get sent emails report\](https://developer.close.com/api/resources/reporting/get-sent-emails.mdx)
\- API Endpoints > Search & Reporting > Reporting \[Get lead status change report\](https://developer.close.com/api/resources/reporting/get-lead-statuses.mdx)
\- API Endpoints > Search & Reporting > Reporting \[Get opportunity status change report\](https://developer.close.com/api/resources/reporting/get-opportunity-statuses.mdx)
\- API Endpoints > Automation & Bulk Actions > Sequences (Workflows) \[List Sequences\](https://developer.close.com/api/resources/sequences/list.mdx)
\- API Endpoints > Automation & Bulk Actions > Sequences (Workflows) \[Create a Sequence\](https://developer.close.com/api/resources/sequences/create.mdx)
\- API Endpoints > Automation & Bulk Actions > Sequences (Workflows) \[Fetch a Sequence\](https://developer.close.com/api/resources/sequences/get.mdx)
\- API Endpoints > Automation & Bulk Actions > Sequences (Workflows) \[Update a Sequence\](https://developer.close.com/api/resources/sequences/update.mdx)
\- API Endpoints > Automation & Bulk Actions > Sequences (Workflows) \[Delete a Sequence\](https://developer.close.com/api/resources/sequences/delete.mdx)
\- API Endpoints > Automation & Bulk Actions > Sequences (Workflows) \[List Sequence Subscriptions\](https://developer.close.com/api/resources/sequences/list-subscriptions.mdx)
\- API Endpoints > Automation & Bulk Actions > Sequences (Workflows) \[Subscribe a Contact to a Sequence\](https://developer.close.com/api/resources/sequences/create-subscription.mdx)
\- API Endpoints > Automation & Bulk Actions > Sequences (Workflows) \[Fetch a single Sequence Subscription\](https://developer.close.com/api/resources/sequences/get-subscription.mdx)
\- API Endpoints > Automation & Bulk Actions > Sequences (Workflows) \[Update a specific Subscription\](https://developer.close.com/api/resources/sequences/update-subscription.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Email \[List bulk emails\](https://developer.close.com/api/resources/bulk-actions/email/list.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Email \[Initiate a new bulk email\](https://developer.close.com/api/resources/bulk-actions/email/create.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Email \[Fetch a single bulk email object\](https://developer.close.com/api/resources/bulk-actions/email/get.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Edit \[List bulk edits\](https://developer.close.com/api/resources/bulk-actions/edit/list.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Edit \[Initiate a new bulk edit\](https://developer.close.com/api/resources/bulk-actions/edit/create.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Edit \[Fetch a single bulk edit object\](https://developer.close.com/api/resources/bulk-actions/edit/get.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Delete \[List bulk deletes\](https://developer.close.com/api/resources/bulk-actions/delete/list.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Delete \[Initiate a new bulk delete\](https://developer.close.com/api/resources/bulk-actions/delete/create.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Delete \[Fetch a single bulk delete object\](https://developer.close.com/api/resources/bulk-actions/delete/get.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Bulk Sequence Subscriptions \[List bulk sequence subscriptions\](https://developer.close.com/api/resources/bulk-actions/sequence-subscriptions/list.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Bulk Sequence Subscriptions \[Initiate a new bulk sequence subscription\](https://developer.close.com/api/resources/bulk-actions/sequence-subscriptions/create.mdx)
\- API Endpoints > Automation & Bulk Actions > Bulk Actions > Bulk Sequence Subscriptions \[Fetch a single bulk sequence subscription object\](https://developer.close.com/api/resources/bulk-actions/sequence-subscriptions/get.mdx)
\- API Endpoints > Automation & Bulk Actions > Exports \[List all the exports\](https://developer.close.com/api/resources/exports/list.mdx)
\- API Endpoints > Automation & Bulk Actions > Exports \[Export leads based on a search query\](https://developer.close.com/api/resources/exports/create-lead.mdx)
\- API Endpoints > Automation & Bulk Actions > Exports \[Export opportunities, based on opportunity filters\](https://developer.close.com/api/resources/exports/create-opportunity.mdx)
\- API Endpoints > Automation & Bulk Actions > Exports \[Get a single Export\](https://developer.close.com/api/resources/exports/get.mdx)
\- API Endpoints > Automation & Bulk Actions > AI Field Enrichment \[Enrich a specific field on a lead or contact using AI\](https://developer.close.com/api/resources/field-enrichment/create.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Custom Field Schemas \[Retrieve a custom field schema\](https://developer.close.com/api/resources/custom-fields/custom-field-schemas/get.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Custom Field Schemas \[Update a custom field schema\](https://developer.close.com/api/resources/custom-fields/custom-field-schemas/update.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Lead Custom Fields \[List Lead Custom Fields\](https://developer.close.com/api/resources/custom-fields/custom-fields-lead/list.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Lead Custom Fields \[Create a new Lead Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-lead/create.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Lead Custom Fields \[Fetch Lead Custom Field's details\](https://developer.close.com/api/resources/custom-fields/custom-fields-lead/get.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Lead Custom Fields \[Update a Lead Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-lead/update.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Lead Custom Fields \[Delete a Lead Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-lead/delete.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Contact Custom Fields \[List Contact Custom Fields\](https://developer.close.com/api/resources/custom-fields/custom-fields-contact/list.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Contact Custom Fields \[Create a new Contact Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-contact/create.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Contact Custom Fields \[Fetch Contact Custom Field's details\](https://developer.close.com/api/resources/custom-fields/custom-fields-contact/get.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Contact Custom Fields \[Update a Contact Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-contact/update.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Contact Custom Fields \[Delete a Contact Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-contact/delete.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Opportunity Custom Fields \[List Opportunity Custom Fields\](https://developer.close.com/api/resources/custom-fields/custom-fields-opportunity/list.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Opportunity Custom Fields \[Create a new Opportunity Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-opportunity/create.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Opportunity Custom Fields \[Fetch Opportunity Custom Field's details\](https://developer.close.com/api/resources/custom-fields/custom-fields-opportunity/get.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Opportunity Custom Fields \[Update an Opportunity Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-opportunity/update.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Opportunity Custom Fields \[Delete an Opportunity Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-opportunity/delete.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Activity Custom Fields \[List Activity Custom Fields\](https://developer.close.com/api/resources/custom-fields/custom-fields-activity/list.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Activity Custom Fields \[Create a new Activity Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-activity/create.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Activity Custom Fields \[Fetch Activity Custom Field's details\](https://developer.close.com/api/resources/custom-fields/custom-fields-activity/get.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Activity Custom Fields \[Update an Activity Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-activity/update.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Activity Custom Fields \[Delete an Activity Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-activity/delete.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Custom Object Custom Fields \[List Custom Object Custom Fields\](https://developer.close.com/api/resources/custom-fields/custom-fields-custom-object/list.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Custom Object Custom Fields \[Create a new Custom Object Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-custom-object/create.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Custom Object Custom Fields \[Fetch Custom Object Custom Field's details\](https://developer.close.com/api/resources/custom-fields/custom-fields-custom-object/get.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Custom Object Custom Fields \[Update a Custom Object Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-custom-object/update.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Custom Object Custom Fields \[Delete a Custom Object Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-custom-object/delete.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Shared Custom Fields \[List Shared Custom Fields\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared/list.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Shared Custom Fields \[Create a new Shared Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared/create.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Shared Custom Fields \[Fetch Shared Custom Field's details\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared/get.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Shared Custom Fields \[Update a Shared Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared/update.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Shared Custom Fields \[Delete a Shared Custom Field\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared/delete.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Shared Custom Fields \[Associate a Shared Custom Field with an object type\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared/create-association.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Shared Custom Fields \[Fetch a Shared Custom Field Association\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared/get-association.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Shared Custom Fields \[Update an existing Shared Custom Field Association\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared/update-association.mdx)
\- API Endpoints > CRM Configuration > Custom Fields > Shared Custom Fields \[Disassociate a Shared Custom Field from an object type\](https://developer.close.com/api/resources/custom-fields/custom-fields-shared/delete-association.mdx)
\- API Endpoints > CRM Configuration > Custom Activity Types \[List Custom Activity Types\](https://developer.close.com/api/resources/custom-activity-types/list.mdx)
\- API Endpoints > CRM Configuration > Custom Activity Types \[Create new Custom Activity Type\](https://developer.close.com/api/resources/custom-activity-types/create.mdx)
\- API Endpoints > CRM Configuration > Custom Activity Types \[Retrieve a single Custom Activity Type\](https://developer.close.com/api/resources/custom-activity-types/get.mdx)
\- API Endpoints > CRM Configuration > Custom Activity Types \[Update existing Custom Activity Type\](https://developer.close.com/api/resources/custom-activity-types/update.mdx)
\- API Endpoints > CRM Configuration > Custom Activity Types \[Delete a Custom Activity Type\](https://developer.close.com/api/resources/custom-activity-types/delete.mdx)
\- API Endpoints > CRM Configuration > Custom Object Types \[List Custom Object Types\](https://developer.close.com/api/resources/custom-object-types/list.mdx)
\- API Endpoints > CRM Configuration > Custom Object Types \[Create new Custom Object Type\](https://developer.close.com/api/resources/custom-object-types/create.mdx)
\- API Endpoints > CRM Configuration > Custom Object Types \[Retrieve a single Custom Object Type\](https://developer.close.com/api/resources/custom-object-types/get.mdx)
\- API Endpoints > CRM Configuration > Custom Object Types \[Update existing Custom Object Type\](https://developer.close.com/api/resources/custom-object-types/update.mdx)
\- API Endpoints > CRM Configuration > Custom Object Types \[Delete a Custom Object Type\](https://developer.close.com/api/resources/custom-object-types/delete.mdx)
\- API Endpoints > CRM Configuration > Pipelines \[List Pipelines for your organization\](https://developer.close.com/api/resources/pipelines/list.mdx)
\- API Endpoints > CRM Configuration > Pipelines \[Create a Pipeline\](https://developer.close.com/api/resources/pipelines/create.mdx)
\- API Endpoints > CRM Configuration > Pipelines \[Update a Pipeline\](https://developer.close.com/api/resources/pipelines/update.mdx)
\- API Endpoints > CRM Configuration > Pipelines \[Delete a Pipeline\](https://developer.close.com/api/resources/pipelines/delete.mdx)
\- API Endpoints > CRM Configuration > Opportunity Statuses \[List opportunity statuses for your organization\](https://developer.close.com/api/resources/opportunity-statuses/list.mdx)
\- API Endpoints > CRM Configuration > Opportunity Statuses \[Create an opportunity status\](https://developer.close.com/api/resources/opportunity-statuses/create.mdx)
\- API Endpoints > CRM Configuration > Opportunity Statuses \[Rename an opportunity status\](https://developer.close.com/api/resources/opportunity-statuses/update.mdx)
\- API Endpoints > CRM Configuration > Opportunity Statuses \[Delete an opportunity status\](https://developer.close.com/api/resources/opportunity-statuses/delete.mdx)
\- API Endpoints > CRM Configuration > Lead Statuses \[List lead statuses for your organization\](https://developer.close.com/api/resources/lead-statuses/list.mdx)
\- API Endpoints > CRM Configuration > Lead Statuses \[Create a new status that can be applied to leads\](https://developer.close.com/api/resources/lead-statuses/create.mdx)
\- API Endpoints > CRM Configuration > Lead Statuses \[Rename a lead status\](https://developer.close.com/api/resources/lead-statuses/update.mdx)
\- API Endpoints > CRM Configuration > Lead Statuses \[Delete a lead status\](https://developer.close.com/api/resources/lead-statuses/delete.mdx)
\- API Endpoints > CRM Configuration > Integration Links \[Get all integration links for your organization\](https://developer.close.com/api/resources/integration-links/list.mdx)
\- API Endpoints > CRM Configuration > Integration Links \[Create an integration link\](https://developer.close.com/api/resources/integration-links/create.mdx)
\- API Endpoints > CRM Configuration > Integration Links \[Get a single integration link\](https://developer.close.com/api/resources/integration-links/get.mdx)
\- API Endpoints > CRM Configuration > Integration Links \[Update an integration link\](https://developer.close.com/api/resources/integration-links/update.mdx)
\- API Endpoints > CRM Configuration > Integration Links \[Delete an integration link\](https://developer.close.com/api/resources/integration-links/delete.mdx)
\- API Endpoints > Communication Configuration > Email Templates \[List email templates\](https://developer.close.com/api/resources/email-templates/list.mdx)
\- API Endpoints > Communication Configuration > Email Templates \[Create an email template\](https://developer.close.com/api/resources/email-templates/create.mdx)
\- API Endpoints > Communication Configuration > Email Templates \[Fetch an email template\](https://developer.close.com/api/resources/email-templates/get.mdx)
\- API Endpoints > Communication Configuration > Email Templates \[Update an email template\](https://developer.close.com/api/resources/email-templates/update.mdx)
\- API Endpoints > Communication Configuration > Email Templates \[Delete an email template\](https://developer.close.com/api/resources/email-templates/delete.mdx)
\- API Endpoints > Communication Configuration > Email Templates \[Render an email template\](https://developer.close.com/api/resources/email-templates/render.mdx)
\- API Endpoints > Communication Configuration > SMS Templates \[List SMS templates\](https://developer.close.com/api/resources/sms-templates/list.mdx)
\- API Endpoints > Communication Configuration > SMS Templates \[Create an SMS template\](https://developer.close.com/api/resources/sms-templates/create.mdx)
\- API Endpoints > Communication Configuration > SMS Templates \[Fetch an SMS template\](https://developer.close.com/api/resources/sms-templates/get.mdx)
\- API Endpoints > Communication Configuration > SMS Templates \[Update an SMS template\](https://developer.close.com/api/resources/sms-templates/update.mdx)
\- API Endpoints > Communication Configuration > SMS Templates \[Delete an SMS template\](https://developer.close.com/api/resources/sms-templates/delete.mdx)
\- API Endpoints > Communication Configuration > Outcomes \[List or filter outcomes\](https://developer.close.com/api/resources/outcomes/list.mdx)
\- API Endpoints > Communication Configuration > Outcomes \[Create an outcome\](https://developer.close.com/api/resources/outcomes/create.mdx)
\- API Endpoints > Communication Configuration > Outcomes \[Fetch a single outcome\](https://developer.close.com/api/resources/outcomes/get.mdx)
\- API Endpoints > Communication Configuration > Outcomes \[Update an outcome\](https://developer.close.com/api/resources/outcomes/update.mdx)
\- API Endpoints > Communication Configuration > Outcomes \[Delete an outcome\](https://developer.close.com/api/resources/outcomes/delete.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[List User Scheduling Links\](https://developer.close.com/api/resources/scheduling-links/list.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Create a User Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/create.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Create or update a Scheduling Link via OAuth\](https://developer.close.com/api/resources/scheduling-links/create-integration.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Delete a User Scheduling Link via OAuth integration\](https://developer.close.com/api/resources/scheduling-links/delete-integration.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Fetch a User Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/get.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Update a User Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/update.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Delete a User Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/delete.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[List Shared Scheduling Links\](https://developer.close.com/api/resources/scheduling-links/list-shared.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Create a Shared Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/create-shared.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Fetch a Shared Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/get-shared.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Update a Shared Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/update-shared.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Delete a Shared Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/delete-shared.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Map a Shared Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/create-shared-association.mdx)
\- API Endpoints > Communication Configuration > Scheduling Links \[Unmap a Shared Scheduling Link\](https://developer.close.com/api/resources/scheduling-links/delete-shared-association.mdx)
\- API Endpoints > Communication Configuration > Connected Accounts \[List connected accounts\](https://developer.close.com/api/resources/connected-accounts/list.mdx)
\- API Endpoints > Communication Configuration > Connected Accounts \[Fetch a single connected account\](https://developer.close.com/api/resources/connected-accounts/get.mdx)
\- API Endpoints > Communication Configuration > Send As \[List Send As Associations\](https://developer.close.com/api/resources/send-as/list.mdx)
\- API Endpoints > Communication Configuration > Send As \[Create a Send As Association\](https://developer.close.com/api/resources/send-as/create.mdx)
\- API Endpoints > Communication Configuration > Send As \[Delete a Send As Association by allowed user\](https://developer.close.com/api/resources/send-as/delete-by-user.mdx)
\- API Endpoints > Communication Configuration > Send As \[Edit Send As Associations in bulk\](https://developer.close.com/api/resources/send-as/bulk-create.mdx)
\- API Endpoints > Communication Configuration > Send As \[Retrieve a single Send As Association\](https://developer.close.com/api/resources/send-as/get.mdx)
\- API Endpoints > Communication Configuration > Send As \[Delete a Send As Association by ID\](https://developer.close.com/api/resources/send-as/delete.mdx)
\- API Endpoints > Communication Configuration > Unsubscribed Emails \[List all unsubscribed emails\](https://developer.close.com/api/resources/unsubscribed-emails/list.mdx)
\- API Endpoints > Communication Configuration > Unsubscribed Emails \[Unsubscribe an email address\](https://developer.close.com/api/resources/unsubscribed-emails/create.mdx)
\- API Endpoints > Communication Configuration > Unsubscribed Emails \[Resubscribe an email address\](https://developer.close.com/api/resources/unsubscribed-emails/delete.mdx)
\- API Endpoints > Communication Configuration > Phone Numbers \[List or search for phone numbers\](https://developer.close.com/api/resources/phone-numbers/list.mdx)
\- API Endpoints > Communication Configuration > Phone Numbers \[Request an internal phone number\](https://developer.close.com/api/resources/phone-numbers/create.mdx)
\- API Endpoints > Communication Configuration > Phone Numbers \[Retrieve a single phone number\](https://developer.close.com/api/resources/phone-numbers/get.mdx)
\- API Endpoints > Communication Configuration > Phone Numbers \[Update a phone number\](https://developer.close.com/api/resources/phone-numbers/update.mdx)
\- API Endpoints > Communication Configuration > Phone Numbers \[Delete a phone number\](https://developer.close.com/api/resources/phone-numbers/delete.mdx)
\- API Endpoints > Communication Configuration > Blocked Phone Numbers \[List Blocked Phone Numbers\](https://developer.close.com/api/resources/blocked-phone-numbers/list.mdx)
\- API Endpoints > Communication Configuration > Blocked Phone Numbers \[Create a Blocked Phone Number\](https://developer.close.com/api/resources/blocked-phone-numbers/create.mdx)
\- API Endpoints > Communication Configuration > Blocked Phone Numbers \[Retrieve Blocked Phone Number settings\](https://developer.close.com/api/resources/blocked-phone-numbers/get-settings.mdx)
\- API Endpoints > Communication Configuration > Blocked Phone Numbers \[Update Blocked Phone Number settings\](https://developer.close.com/api/resources/blocked-phone-numbers/update-settings.mdx)
\- API Endpoints > Communication Configuration > Blocked Phone Numbers \[Retrieve a single Blocked Phone Number\](https://developer.close.com/api/resources/blocked-phone-numbers/get.mdx)
\- API Endpoints > Communication Configuration > Blocked Phone Numbers \[Update a Blocked Phone Number\](https://developer.close.com/api/resources/blocked-phone-numbers/update.mdx)
\- API Endpoints > Communication Configuration > Blocked Phone Numbers \[Delete a Blocked Phone Number\](https://developer.close.com/api/resources/blocked-phone-numbers/delete.mdx)
\- API Endpoints > Communication Configuration > Dialers \[List or filter all dialer sessions\](https://developer.close.com/api/resources/dialers/list.mdx)
\- API Endpoints > Communication Configuration > Dialers \[Get a single dialer session\](https://developer.close.com/api/resources/dialers/get.mdx)
\- API Endpoints > Users & Organizations > Users \[Fetch information about yourself\](https://developer.close.com/api/resources/users/get-me.mdx)
\- API Endpoints > Users & Organizations > Users \[List users in your organization\](https://developer.close.com/api/resources/users/list.mdx)
\- API Endpoints > Users & Organizations > Users \[List user availability statuses\](https://developer.close.com/api/resources/users/list-availabilities.mdx)
\- API Endpoints > Users & Organizations > Users \[Fetch a single user\](https://developer.close.com/api/resources/users/get.mdx)
\- API Endpoints > Users & Organizations > Organizations \[Get an organization's details\](https://developer.close.com/api/resources/organizations/get.mdx)
\- API Endpoints > Users & Organizations > Organizations \[Update an organization\](https://developer.close.com/api/resources/organizations/update.mdx)
\- API Endpoints > Users & Organizations > Memberships \[Create a membership\](https://developer.close.com/api/resources/memberships/create.mdx)
\- API Endpoints > Users & Organizations > Memberships \[Bulk update memberships\](https://developer.close.com/api/resources/memberships/bulk-update.mdx)
\- API Endpoints > Users & Organizations > Memberships \[Update a membership\](https://developer.close.com/api/resources/memberships/update.mdx)
\- API Endpoints > Users & Organizations > Memberships \[Get pinned views for a membership\](https://developer.close.com/api/resources/memberships/get-pinned-views.mdx)
\- API Endpoints > Users & Organizations > Memberships \[Update pinned views for a membership\](https://developer.close.com/api/resources/memberships/update-pinned-views.mdx)
\- API Endpoints > Users & Organizations > Roles \[List all the roles defined for your organization\](https://developer.close.com/api/resources/roles/list.mdx)
\- API Endpoints > Users & Organizations > Roles \[Create a new role\](https://developer.close.com/api/resources/roles/create.mdx)
\- API Endpoints > Users & Organizations > Roles \[Fetch a single role\](https://developer.close.com/api/resources/roles/get.mdx)
\- API Endpoints > Users & Organizations > Roles \[Update existing role\](https://developer.close.com/api/resources/roles/update.mdx)
\- API Endpoints > Users & Organizations > Roles \[Delete a role\](https://developer.close.com/api/resources/roles/delete.mdx)
\- API Endpoints > Users & Organizations > Groups \[List Groups for your organization\](https://developer.close.com/api/resources/groups/list.mdx)
\- API Endpoints > Users & Organizations > Groups \[Create a Group\](https://developer.close.com/api/resources/groups/create.mdx)
\- API Endpoints > Users & Organizations > Groups \[Add a User to a Group\](https://developer.close.com/api/resources/groups/add-member.mdx)
\- API Endpoints > Users & Organizations > Groups \[Remove a User from a Group\](https://developer.close.com/api/resources/groups/remove-member.mdx)
\- API Endpoints > Users & Organizations > Groups \[Fetch an individual Group\](https://developer.close.com/api/resources/groups/get.mdx)
\- API Endpoints > Users & Organizations > Groups \[Update a Group\](https://developer.close.com/api/resources/groups/update.mdx)
\- API Endpoints > Users & Organizations > Groups \[Delete a Group\](https://developer.close.com/api/resources/groups/delete.mdx)

\## OpenAPI Specification

The raw OpenAPI 3.1 specification for this API is available at:
\- \[OpenAPI JSON\](https://developer.close.com/openapi.json)
\- \[OpenAPI YAML\](https://developer.close.com/openapi.yaml)