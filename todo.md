# TODO IZARchiv


# records:
- [ ] relative dates with filtering
- [ ] reducing of values

- [ ] records export

- [ ] presets with favourites

- [ ] charts

# sources:
- [ ] filtering for sources
- [ ] disabling/deleting sources
- [ ] manually adding sources: IZAR XML, IZAR XLS, MBUS, JSON

# devices:
- [ ] device editing: name, description, favorite, overview_columns

# general:
- [ ] Webserver authentication (static username and password in settings.js)

- [ ] serve those files just uploaded in the current connection

- [ ] check warning and error handling

# backup:
- [ ] possibility to create regular copy of database file to a specified location (eg. onedrive folder)

# done:
- [x] delta calculation (not working)
- [x] date timezone handling
- [x] filtering (not yet working)
- [x] dashboard
- [x] device favourites -> dashboard


reduce values to one per hour:
```sql
WITH RECURSIVE hours AS (
    SELECT strftime('%Y-%m-%d 12:00:00', min(time)) AS hour_start
    FROM records
    UNION ALL
    SELECT datetime(hour_start, '+24 hour')
    FROM hours
    WHERE hour_start < (SELECT max(time) FROM records)
),
closest_values AS (
    SELECT 
        h.hour_start,
        r.id,
        r.data,
        r.time,
        ABS(strftime('%s', r.time) - strftime('%s', h.hour_start)) AS time_diff,
        ROW_NUMBER() OVER (PARTITION BY h.hour_start ORDER BY ABS(strftime('%s', r.time) - strftime('%s', h.hour_start))) AS rank
    FROM hours h
    LEFT JOIN records r
    ON r.time >= datetime(h.hour_start, '-12 hours')
       AND r.time < datetime(h.hour_start, '+12 hours')
	   AND device = 3
)
SELECT hour_start, id, data, time
FROM closest_values
WHERE rank = 1;
```
