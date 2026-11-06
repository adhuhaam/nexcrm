-- Finance module: employee-linked expenses, recurring keys, fee settings, WP deposit rates

alter table expenses add column if not exists employee_id uuid references employees (id) on delete set null;
alter table expenses add column if not exists recurrence_key text;

alter table expenses drop constraint if exists expenses_category_check;
alter table expenses add constraint expenses_category_check
  check (category in (
    'client_payment', 'investment', 'other',
    'work_permit', 'insurance', 'medical', 'deposit'
  ));

alter table expenses drop constraint if exists expenses_client_link_check;
alter table expenses add constraint expenses_client_link_check
  check (
    (category = 'client_payment')
    or (client_company_id is null)
  );

create unique index if not exists expenses_recurrence_key_uidx
  on expenses (recurrence_key)
  where recurrence_key is not null;

create index if not exists expenses_employee_idx on expenses (employee_id);
create index if not exists expenses_category_employee_idx on expenses (category, employee_id);

create table if not exists finance_fee_settings (
  id uuid primary key,
  work_permit_monthly numeric(12, 2) not null default 350,
  insurance_yearly numeric(12, 2) not null default 800,
  medical_yearly numeric(12, 2) not null default 500,
  currency text not null default 'MVR',
  updated_at timestamptz not null default now()
);

insert into finance_fee_settings (id, work_permit_monthly, insurance_yearly, medical_yearly, currency)
select gen_random_uuid(), 350, 800, 500, 'MVR'
where not exists (select 1 from finance_fee_settings);

create table if not exists wp_deposit_rates (
  id uuid primary key,
  country_name text not null,
  iso_code text not null,
  amount numeric(12, 2) not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists wp_deposit_rates_name_uidx on wp_deposit_rates (lower(country_name));
create index if not exists wp_deposit_rates_iso_idx on wp_deposit_rates (upper(iso_code));

-- Seed XPAT deposit rates (announcement 80). Skip rows that already exist by ISO.
insert into wp_deposit_rates (id, country_name, iso_code, amount)
select v.id, v.country_name, v.iso_code, v.amount
from (values
  (gen_random_uuid(), 'Afghanistan', 'AFG', 18300.00),
  (gen_random_uuid(), 'Albania', 'ALB', 20900.00),
  (gen_random_uuid(), 'Algeria', 'DZA', 31100.00),
  (gen_random_uuid(), 'Andorra', 'AND', 11900.00),
  (gen_random_uuid(), 'Angola', 'AGO', 33000.00),
  (gen_random_uuid(), 'Antigua and Barbuda', 'ATG', 42405.00),
  (gen_random_uuid(), 'Argentina', 'ARG', 51850.00),
  (gen_random_uuid(), 'Armenia', 'ARM', 15500.00),
  (gen_random_uuid(), 'Australia', 'AUS', 12200.00),
  (gen_random_uuid(), 'Austria', 'AUT', 13850.00),
  (gen_random_uuid(), 'Azerbaijan', 'AZE', 12000.00),
  (gen_random_uuid(), 'Bahamas', 'BHS', 35420.00),
  (gen_random_uuid(), 'Bahrain', 'BHR', 6450.00),
  (gen_random_uuid(), 'Bangladesh', 'BGD', 8000.00),
  (gen_random_uuid(), 'Barbados', 'BRB', 50500.00),
  (gen_random_uuid(), 'Belarus', 'BLR', 25850.00),
  (gen_random_uuid(), 'Belgium', 'BEL', 20795.00),
  (gen_random_uuid(), 'Belize', 'BLZ', 23130.00),
  (gen_random_uuid(), 'Benin', 'BEN', 16300.00),
  (gen_random_uuid(), 'Bhutan', 'BTN', 9000.00),
  (gen_random_uuid(), 'Bolivia', 'BOL', 31010.00),
  (gen_random_uuid(), 'Bosnia-Herzegovina', 'BIH', 15750.00),
  (gen_random_uuid(), 'Botswana', 'BWA', 43900.00),
  (gen_random_uuid(), 'Brazil', 'BRA', 27020.00),
  (gen_random_uuid(), 'Brunei', 'BRN', 13900.00),
  (gen_random_uuid(), 'Bulgaria', 'BGR', 12800.00),
  (gen_random_uuid(), 'Cambodia', 'KHM', 6900.00),
  (gen_random_uuid(), 'Cameroon', 'CMR', 10800.00),
  (gen_random_uuid(), 'Canada', 'CAN', 17650.00),
  (gen_random_uuid(), 'Cape Verde Islands', 'CPV', 25750.00),
  (gen_random_uuid(), 'Chad', 'TCD', 14200.00),
  (gen_random_uuid(), 'Chile', 'CHL', 31010.00),
  (gen_random_uuid(), 'China', 'CHN', 8650.00),
  (gen_random_uuid(), 'Colombia', 'COL', 20800.00),
  (gen_random_uuid(), 'Congo', 'COG', 21300.00),
  (gen_random_uuid(), 'Congo, The DRC', 'COD', 22200.00),
  (gen_random_uuid(), 'Costa Rica', 'CRI', 18500.00),
  (gen_random_uuid(), 'Cote D''ivoire', 'CIV', 10300.00),
  (gen_random_uuid(), 'Croatia', 'HRV', 21700.00),
  (gen_random_uuid(), 'Cuba', 'CUB', 25500.00),
  (gen_random_uuid(), 'Cyprus', 'CYP', 9000.00),
  (gen_random_uuid(), 'Czech Republic', 'CZE', 20800.00),
  (gen_random_uuid(), 'Denmark', 'DNK', 12100.00),
  (gen_random_uuid(), 'Djibouti', 'DJI', 14000.00),
  (gen_random_uuid(), 'Dominica', 'DMA', 23100.00),
  (gen_random_uuid(), 'Dominican Republic', 'DOM', 20000.00),
  (gen_random_uuid(), 'Ecuador', 'ECU', 49000.00),
  (gen_random_uuid(), 'Egypt', 'EGY', 7700.00),
  (gen_random_uuid(), 'El Salvador', 'SLV', 27000.00),
  (gen_random_uuid(), 'Estonia', 'EST', 33200.00),
  (gen_random_uuid(), 'Ethiopia', 'ETH', 11800.00),
  (gen_random_uuid(), 'Fiji', 'FJI', 23200.00),
  (gen_random_uuid(), 'Finland', 'FIN', 23400.00),
  (gen_random_uuid(), 'France', 'FRA', 12500.00),
  (gen_random_uuid(), 'Gambia', 'GMB', 37600.00),
  (gen_random_uuid(), 'Georgia', 'GEO', 5800.00),
  (gen_random_uuid(), 'Germany', 'DEU', 11900.00),
  (gen_random_uuid(), 'Ghana', 'GHA', 37400.00),
  (gen_random_uuid(), 'Greece', 'GRC', 10400.00),
  (gen_random_uuid(), 'Guatemala', 'GTM', 12900.00),
  (gen_random_uuid(), 'Guinea', 'GIN', 40000.00),
  (gen_random_uuid(), 'Guyana', 'GUY', 3800.00),
  (gen_random_uuid(), 'Haiti', 'HTI', 25000.00),
  (gen_random_uuid(), 'Honduras', 'HND', 12200.00),
  (gen_random_uuid(), 'Hungary', 'HUN', 19900.00),
  (gen_random_uuid(), 'Iceland', 'ISL', 27800.00),
  (gen_random_uuid(), 'India', 'IND', 3500.00),
  (gen_random_uuid(), 'Indonesia', 'IDN', 5000.00),
  (gen_random_uuid(), 'Iran', 'IRN', 5400.00),
  (gen_random_uuid(), 'Iraq', 'IRQ', 8500.00),
  (gen_random_uuid(), 'Ireland', 'IRL', 15700.00),
  (gen_random_uuid(), 'Israel', 'ISR', 10700.00),
  (gen_random_uuid(), 'Italy', 'ITA', 11400.00),
  (gen_random_uuid(), 'Jamaica', 'JAM', 27800.00),
  (gen_random_uuid(), 'Japan', 'JPN', 8900.00),
  (gen_random_uuid(), 'Jordan', 'JOR', 7700.00),
  (gen_random_uuid(), 'Kazakhstan', 'KAZ', 11300.00),
  (gen_random_uuid(), 'Kenya', 'KEN', 19500.00),
  (gen_random_uuid(), 'Kiribati', 'KIR', 51886.00),
  (gen_random_uuid(), 'Korea, D.P.R.O.', 'PRK', 10100.00),
  (gen_random_uuid(), 'Korea, Republic of', 'KOR', 10050.00),
  (gen_random_uuid(), 'Kosovo', 'XKX', 19160.00),
  (gen_random_uuid(), 'Kuwait', 'KWT', 6150.00),
  (gen_random_uuid(), 'Kyrgyzstan', 'KGZ', 11500.00),
  (gen_random_uuid(), 'Laos', 'LAO', 6000.00),
  (gen_random_uuid(), 'Latvia', 'LVA', 15500.00),
  (gen_random_uuid(), 'Lebanon', 'LBN', 7400.00),
  (gen_random_uuid(), 'Liberia', 'LBR', 11600.00),
  (gen_random_uuid(), 'Libyan Arab Jamahiriya', 'LBY', 6900.00),
  (gen_random_uuid(), 'Liechtenstein', 'LIE', 12800.00),
  (gen_random_uuid(), 'Lithuania', 'LTU', 12750.00),
  (gen_random_uuid(), 'Luxembourg', 'LUX', 41200.00),
  (gen_random_uuid(), 'Macau', 'MAC', 9000.00),
  (gen_random_uuid(), 'Macedonia', 'MKD', 14800.00),
  (gen_random_uuid(), 'Madagascar', 'MDG', 8250.00),
  (gen_random_uuid(), 'Malawi', 'MWI', 41400.00),
  (gen_random_uuid(), 'Malaysia', 'MYS', 3800.00),
  (gen_random_uuid(), 'Mali', 'MLI', 38500.00),
  (gen_random_uuid(), 'Malta', 'MLT', 17200.00),
  (gen_random_uuid(), 'Mauritania', 'MRT', 33500.00),
  (gen_random_uuid(), 'Mauritius', 'MUS', 10800.00),
  (gen_random_uuid(), 'Mexico', 'MEX', 20300.00),
  (gen_random_uuid(), 'Moldova', 'MDA', 5800.00),
  (gen_random_uuid(), 'Mongolia', 'MNG', 15000.00),
  (gen_random_uuid(), 'Montenegro', 'MNE', 18900.00),
  (gen_random_uuid(), 'Morocco', 'MAR', 15600.00),
  (gen_random_uuid(), 'Mozambique', 'MOZ', 32100.00),
  (gen_random_uuid(), 'Myanmar', 'MMR', 6750.00),
  (gen_random_uuid(), 'Namibia', 'NAM', 29700.00),
  (gen_random_uuid(), 'Nepal', 'NPL', 8000.00),
  (gen_random_uuid(), 'Netherlands', 'NLD', 12500.00),
  (gen_random_uuid(), 'New Zealand', 'NZL', 14500.00),
  (gen_random_uuid(), 'Nicaragua', 'NIC', 64000.00),
  (gen_random_uuid(), 'Niger', 'NER', 11000.00),
  (gen_random_uuid(), 'Nigeria', 'NGA', 11000.00),
  (gen_random_uuid(), 'Norway', 'NOR', 23800.00),
  (gen_random_uuid(), 'Oman', 'OMN', 7700.00),
  (gen_random_uuid(), 'Pakistan', 'PAK', 3800.00),
  (gen_random_uuid(), 'Palau', 'PLW', 25000.00),
  (gen_random_uuid(), 'Palestine', 'PSE', 7100.00),
  (gen_random_uuid(), 'Panama', 'PAN', 11550.00),
  (gen_random_uuid(), 'Papua New Guinea', 'PNG', 25000.00),
  (gen_random_uuid(), 'Paraguay', 'PRY', 89550.00),
  (gen_random_uuid(), 'Peru', 'PER', 73200.00),
  (gen_random_uuid(), 'Philippines', 'PHL', 5500.00),
  (gen_random_uuid(), 'Poland', 'POL', 41450.00),
  (gen_random_uuid(), 'Portugal', 'PRT', 21800.00),
  (gen_random_uuid(), 'Qatar', 'QAT', 6150.00),
  (gen_random_uuid(), 'Romania', 'ROU', 19000.00),
  (gen_random_uuid(), 'Russia', 'RUS', 16200.00),
  (gen_random_uuid(), 'Rwanda', 'RWA', 24000.00),
  (gen_random_uuid(), 'Saint Kitts and Nevis', 'KNA', 50700.00),
  (gen_random_uuid(), 'Saint Lucia', 'LCA', 35000.00),
  (gen_random_uuid(), 'Saint Vincent and the Grenadines', 'VCT', 16700.00),
  (gen_random_uuid(), 'Samoa', 'WSM', 31700.00),
  (gen_random_uuid(), 'San Marino', 'SMR', 10800.00),
  (gen_random_uuid(), 'Saudi Arabia', 'SAU', 6300.00),
  (gen_random_uuid(), 'Senegal', 'SEN', 11200.00),
  (gen_random_uuid(), 'Serbia', 'SRB', 18900.00),
  (gen_random_uuid(), 'Seychelles', 'SYC', 11200.00),
  (gen_random_uuid(), 'Sierra Leone', 'SLE', 35900.00),
  (gen_random_uuid(), 'Singapore', 'SGP', 5400.00),
  (gen_random_uuid(), 'Slovakia', 'SVK', 13200.00),
  (gen_random_uuid(), 'Slovenia', 'SVN', 19600.00),
  (gen_random_uuid(), 'Somalia', 'SOM', 10900.00),
  (gen_random_uuid(), 'South Africa', 'ZAF', 14200.00),
  (gen_random_uuid(), 'Spain', 'ESP', 11900.00),
  (gen_random_uuid(), 'Sri Lanka', 'LKA', 4000.00),
  (gen_random_uuid(), 'Sudan', 'SDN', 9800.00),
  (gen_random_uuid(), 'Suriname', 'SUR', 28600.00),
  (gen_random_uuid(), 'Swaziland', 'SWZ', 12400.00),
  (gen_random_uuid(), 'Sweden', 'SWE', 9000.00),
  (gen_random_uuid(), 'Switzerland', 'CHE', 12400.00),
  (gen_random_uuid(), 'Syria', 'SYR', 25600.00),
  (gen_random_uuid(), 'Taiwan', 'TWN', 7800.00),
  (gen_random_uuid(), 'Tajikistan', 'TJK', 13300.00),
  (gen_random_uuid(), 'Tanzania', 'TZA', 13300.00),
  (gen_random_uuid(), 'Thailand', 'THA', 3900.00),
  (gen_random_uuid(), 'Togo', 'TGO', 29800.00),
  (gen_random_uuid(), 'Trinidad and Tobago', 'TTO', 25900.00),
  (gen_random_uuid(), 'Tunisia', 'TUN', 12850.00),
  (gen_random_uuid(), 'Turkey', 'TUR', 21200.00),
  (gen_random_uuid(), 'Turkmenistan', 'TKM', 5400.00),
  (gen_random_uuid(), 'Uganda', 'UGA', 19600.00),
  (gen_random_uuid(), 'Ukraine', 'UKR', 9400.00),
  (gen_random_uuid(), 'United Arab Emirates', 'ARE', 7050.00),
  (gen_random_uuid(), 'United Kingdom', 'GBR', 13300.00),
  (gen_random_uuid(), 'United States of America', 'USA', 18750.00),
  (gen_random_uuid(), 'Uruguay', 'URY', 32900.00),
  (gen_random_uuid(), 'Uzbekistan', 'UZB', 8600.00),
  (gen_random_uuid(), 'Vanuatu', 'VUT', 39195.00),
  (gen_random_uuid(), 'Venezuela', 'VEN', 13200.00),
  (gen_random_uuid(), 'Vietnam', 'VNM', 5700.00),
  (gen_random_uuid(), 'Yemen', 'YEM', 17500.00),
  (gen_random_uuid(), 'Zambia', 'ZMB', 18700.00),
  (gen_random_uuid(), 'Zimbabwe', 'ZWE', 24800.00),
  (gen_random_uuid(), 'Bangladeshi', 'BGD', 8000.00),
  (gen_random_uuid(), 'Indian', 'IND', 3500.00),
  (gen_random_uuid(), 'Sri Lankan', 'LKA', 4000.00),
  (gen_random_uuid(), 'Nepalese', 'NPL', 8000.00),
  (gen_random_uuid(), 'Filipino', 'PHL', 5500.00),
  (gen_random_uuid(), 'Indonesian', 'IDN', 5000.00),
  (gen_random_uuid(), 'Pakistani', 'PAK', 3800.00),
  (gen_random_uuid(), 'Chinese', 'CHN', 8650.00)
) as v(id, country_name, iso_code, amount)
where not exists (
  select 1 from wp_deposit_rates r where upper(r.iso_code) = upper(v.iso_code) and lower(r.country_name) = lower(v.country_name)
);
