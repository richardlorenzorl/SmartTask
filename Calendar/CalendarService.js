import { google } from 'googleapis';
import { microsoft } from '@microsoft/microsoft-graph-client';
import { differenceInMinutes, addMinutes, parseISO } from 'date-fns';

export default function CreateCalendarService() {
    // Config and constants
    const MIN_MEETING_DURATION = 30;
    const WORK_START_HOUR = 9;
    const WORK_END_HOUR = 17;
    
    // Initialize calendar API clients
    const googleCalendar = google.calendar('v3');
    const microsoftGraph = microsoft.api.client;

    async function syncCalendars(userId) {
        try {
            const userCalendars = await $db.UserCalendar.FindAll({
                UserId: userId
            });

            const allEvents = [];

            for (const calendar of userCalendars) {
                const events = await fetchCalendarEvents(calendar);
                allEvents.push(...events);
            }

            // Deduplicate and store events
            await deduplicateAndStoreEvents(userId, allEvents);

            return {
                success: true,
                eventCount: allEvents.length
            };
        } catch (error) {
            $log.Error("Calendar sync failed", error);
            throw new UserException("CalendarSyncFailed");
        }
    }

    async function fetchCalendarEvents(calendar) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);

        switch (calendar.Provider) {
            case 'google':
                return fetchGoogleEvents(calendar, startDate, endDate);
            case 'microsoft':
                return fetchMicrosoftEvents(calendar, startDate, endDate);
            default:
                throw new Error(`Unsupported calendar provider: ${calendar.Provider}`);
        }
    }

    async function fetchGoogleEvents(calendar, startDate, endDate) {
        const auth = await getGoogleAuth(calendar.AccessToken);
        
        const response = await googleCalendar.events.list({
            auth,
            calendarId: 'primary',
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
        });

        return response.data.items.map(event => ({
            externalId: event.id,
            provider: 'google',
            title: event.summary,
            description: event.description,
            startTime: event.start.dateTime || event.start.date,
            endTime: event.end.dateTime || event.end.date,
            attendees: event.attendees?.map(a => a.email) || [],
            location: event.location,
            status: mapGoogleStatus(event.status)
        }));
    }

    async function fetchMicrosoftEvents(calendar, startDate, endDate) {
        const client = await getMicrosoftClient(calendar.AccessToken);
        
        const response = await client
            .api('/me/calendar/events')
            .filter(`start/dateTime ge '${startDate.toISOString()}' and end/dateTime le '${endDate.toISOString()}'`)
            .get();

        return response.value.map(event => ({
            externalId: event.id,
            provider: 'microsoft',
            title: event.subject,
            description: event.bodyPreview,
            startTime: event.start.dateTime,
            endTime: event.end.dateTime,
            attendees: event.attendees?.map(a => a.emailAddress.address) || [],
            location: event.location.displayName,
            status: mapMicrosoftStatus(event.showAs)
        }));
    }

    async function findAvailableSlots(userId, duration, preferences = {}) {
        try {
            const workStartHour = preferences.workStartHour || WORK_START_HOUR;
            const workEndHour = preferences.workEndHour || WORK_END_HOUR;
            
            // Get user's calendar events
            const events = await $db.CalendarEvent.FindAll({
                UserId: userId,
                StartTime: { $gte: new Date() },
                EndTime: { $lte: addDays(new Date(), 7) }
            });

            // Get user's working hours and preferences
            const userPreferences = await getUserPreferences(userId);
            
            // Find available slots
            const slots = calculateAvailableSlots(
                events,
                duration,
                workStartHour,
                workEndHour,
                userPreferences
            );

            return slots;
        } catch (error) {
            $log.Error("Finding available slots failed", error);
            throw new UserException("SlotsFindingFailed");
        }
    }

    function calculateAvailableSlots(events, duration, workStartHour, workEndHour, preferences) {
        const slots = [];
        const currentDate = new Date();
        const endDate = addDays(currentDate, 7);

        // Sort events by start time
        events.sort((a, b) => new Date(a.StartTime) - new Date(b.StartTime));

        while (currentDate < endDate) {
            if (isWorkingDay(currentDate, preferences)) {
                const dayStart = setHours(currentDate, workStartHour);
                const dayEnd = setHours(currentDate, workEndHour);
                
                let timeSlot = dayStart;
                
                for (const event of events) {
                    const eventStart = new Date(event.StartTime);
                    const eventEnd = new Date(event.EndTime);
                    
                    // Add slot before event if time is available
                    if (differenceInMinutes(eventStart, timeSlot) >= duration) {
                        slots.push({
                            start: timeSlot,
                            end: addMinutes(timeSlot, duration)
                        });
                    }
                    
                    timeSlot = eventEnd;
                }
                
                // Add slot after last event if time is available
                if (differenceInMinutes(dayEnd, timeSlot) >= duration) {
                    slots.push({
                        start: timeSlot,
                        end: addMinutes(timeSlot, duration)
                    });
                }
            }
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return slots;
    }

    async function scheduleEvent(userId, eventData) {
        try {
            // Validate time slot availability
            const isAvailable = await checkSlotAvailability(
                userId,
                eventData.startTime,
                eventData.endTime
            );

            if (!isAvailable) {
                throw new UserException("TimeSlotNotAvailable");
            }

            // Create event in external calendar
            const userCalendars = await $db.UserCalendar.FindAll({
                UserId: userId
            });

            const createdEvents = [];
            for (const calendar of userCalendars) {
                const externalEvent = await createExternalEvent(calendar, eventData);
                createdEvents.push(externalEvent);
            }

            // Store event in local database
            const localEvent = await $db.CalendarEvent.Create({
                UserId: userId,
                Title: eventData.title,
                Description: eventData.description,
                StartTime: eventData.startTime,
                EndTime: eventData.endTime,
                Attendees: JSON.stringify(eventData.attendees || []),
                Location: eventData.location,
                ExternalIds: JSON.stringify(
                    createdEvents.map(e => ({
                        provider: e.provider,
                        id: e.id
                    }))
                )
            });

            return localEvent;
        } catch (error) {
            $log.Error("Event scheduling failed", error);
            throw new UserException("EventSchedulingFailed");
        }
    }

    async function createExternalEvent(calendar, eventData) {
        switch (calendar.Provider) {
            case 'google':
                return createGoogleEvent(calendar, eventData);
            case 'microsoft':
                return createMicrosoftEvent(calendar, eventData);
            default:
                throw new Error(`Unsupported calendar provider: ${calendar.Provider}`);
        }
    }

    async function createGoogleEvent(calendar, eventData) {
        const auth = await getGoogleAuth(calendar.AccessToken);
        
        const event = {
            summary: eventData.title,
            description: eventData.description,
            start: {
                dateTime: eventData.startTime,
                timeZone: calendar.TimeZone
            },
            end: {
                dateTime: eventData.endTime,
                timeZone: calendar.TimeZone
            },
            attendees: eventData.attendees?.map(email => ({ email })),
            location: eventData.location
        };

        const response = await googleCalendar.events.insert({
            auth,
            calendarId: 'primary',
            resource: event
        });

        return {
            provider: 'google',
            id: response.data.id
        };
    }

    // Helper functions
    function mapGoogleStatus(status) {
        const statusMap = {
            'confirmed': 'confirmed',
            'tentative': 'tentative',
            'cancelled': 'cancelled'
        };
        return statusMap[status] || 'unknown';
    }

    function mapMicrosoftStatus(status) {
        const statusMap = {
            'free': 'free',
            'busy': 'busy',
            'tentative': 'tentative',
            'oof': 'outOfOffice'
        };
        return statusMap[status] || 'unknown';
    }

    async function checkSlotAvailability(userId, startTime, endTime) {
        const conflictingEvents = await $db.CalendarEvent.FindAll({
            UserId: userId,
            $or: [
                {
                    StartTime: { $lt: endTime },
                    EndTime: { $gt: startTime }
                },
                {
                    StartTime: { $gte: startTime, $lt: endTime }
                }
            ]
        });

        return conflictingEvents.length === 0;
    }

    return {
        syncCalendars,
        findAvailableSlots,
        scheduleEvent,
        checkSlotAvailability
    };
}
