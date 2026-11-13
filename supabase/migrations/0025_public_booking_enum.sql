-- 0025_public_booking_enum: the new booking source gets its own migration, because a new enum value cannot be used in the transaction that adds it.
alter type booking_source add value if not exists 'online';
