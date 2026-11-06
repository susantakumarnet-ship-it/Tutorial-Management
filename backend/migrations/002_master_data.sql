-- =====================================================================
-- Reference / master data required by the application
-- =====================================================================

INSERT INTO classes (name, sort_order) VALUES
  ('Nursery', 1), ('LKG', 2), ('UKG', 3),
  ('Class 1', 4), ('Class 2', 5), ('Class 3', 6), ('Class 4', 7),
  ('Class 5', 8), ('Class 6', 9), ('Class 7', 10), ('Class 8', 11),
  ('Class 9', 12), ('Class 10', 13), ('Class 11', 14), ('Class 12', 15);

INSERT INTO boards (name, code, sort_order) VALUES
  ('Central Board of Secondary Education', 'CBSE', 1),
  ('Indian Certificate of Secondary Education', 'ICSE', 2),
  ('State Board', 'STATE', 3),
  ('International Baccalaureate', 'IB', 4),
  ('Cambridge IGCSE', 'IGCSE', 5),
  ('National Institute of Open Schooling', 'NIOS', 6);

INSERT INTO subjects (name, sort_order) VALUES
  ('All Subjects', 1), ('Mathematics', 2), ('Science', 3), ('English', 4),
  ('Hindi', 5), ('Social Studies', 6), ('Physics', 7), ('Chemistry', 8),
  ('Biology', 9), ('Computer Science', 10), ('Accountancy', 11),
  ('Economics', 12), ('Business Studies', 13), ('History', 14),
  ('Geography', 15), ('Political Science', 16), ('Sanskrit', 17),
  ('French', 18), ('EVS', 19), ('Phonics & Handwriting', 20);

-- Starter locality set (admins can add more from the dashboard)
INSERT INTO locations (locality, city, state, pincode, latitude, longitude) VALUES
  ('Indiranagar',      'Bengaluru', 'Karnataka',     '560038', 12.9784, 77.6408),
  ('Koramangala',      'Bengaluru', 'Karnataka',     '560034', 12.9352, 77.6245),
  ('Jayanagar',        'Bengaluru', 'Karnataka',     '560041', 12.9250, 77.5938),
  ('Whitefield',       'Bengaluru', 'Karnataka',     '560066', 12.9698, 77.7500),
  ('HSR Layout',       'Bengaluru', 'Karnataka',     '560102', 12.9116, 77.6474),
  ('Andheri West',     'Mumbai',    'Maharashtra',   '400058', 19.1364, 72.8296),
  ('Bandra West',      'Mumbai',    'Maharashtra',   '400050', 19.0596, 72.8295),
  ('Powai',            'Mumbai',    'Maharashtra',   '400076', 19.1176, 72.9060),
  ('Dwarka',           'New Delhi', 'Delhi',         '110075', 28.5921, 77.0460),
  ('Rohini',           'New Delhi', 'Delhi',         '110085', 28.7383, 77.0822),
  ('Lajpat Nagar',     'New Delhi', 'Delhi',         '110024', 28.5677, 77.2433),
  ('Madhapur',         'Hyderabad', 'Telangana',     '500081', 17.4483, 78.3915),
  ('Kukatpally',       'Hyderabad', 'Telangana',     '500072', 17.4849, 78.4138),
  ('Anna Nagar',       'Chennai',   'Tamil Nadu',    '600040', 13.0850, 80.2101),
  ('Velachery',        'Chennai',   'Tamil Nadu',    '600042', 12.9815, 80.2180),
  ('Kothrud',          'Pune',      'Maharashtra',   '411038', 18.5074, 73.8077),
  ('Hinjewadi',        'Pune',      'Maharashtra',   '411057', 18.5913, 73.7389),
  ('Salt Lake',        'Kolkata',   'West Bengal',   '700091', 22.5800, 88.4170),
  ('Gomti Nagar',      'Lucknow',   'Uttar Pradesh', '226010', 26.8500, 81.0070),
  ('Vaishali Nagar',   'Jaipur',    'Rajasthan',     '302021', 26.9110, 75.7430);

INSERT INTO subscription_plans (code, name, description, price_paise, duration_days, features) VALUES
  ('FREE',        'Free',          'Basic listing. Apply to tuition requirements.',          0,      3650, '["Basic profile listing","Apply to 10 requirements per month"]'),
  ('PRO_MONTHLY', 'Pro (Monthly)', 'Unlimited applications and priority in search results.', 29900,  30,   '["Unlimited applications","Priority in search","Pro badge"]'),
  ('FEATURED_30', 'Featured (30 days)', 'Featured listing at the top of parent searches.',  49900,  30,   '["Featured badge","Top of search results","Highlighted card"]');
