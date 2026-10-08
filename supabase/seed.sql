-- DEVELOPMENT ONLY demo catalogue for a local Supabase stack.
-- Applied by `supabase start` / local database resets (see [db.seed] in supabase/config.toml).
-- `supabase db push` never runs this file, so it does not reach staging or production.
-- Product images are intentionally empty (the storefront shows a placeholder).

insert into public.categories (id,parent_id,name_ar,name_en,image_url,sort_order,size_type) values
('a277259a-ec31-54fb-bada-cca3b5d78ceb',null,'ملابس رجالي','Men''s clothing',null,0,'clothes'),
('3b35b1f0-f0b2-52b1-9859-219a86c2e469','a277259a-ec31-54fb-bada-cca3b5d78ceb','تيشيرتات','T-shirts',null,0,'clothes'),
('249c4f5d-24bc-526b-a70c-5b5f27b056ee','a277259a-ec31-54fb-bada-cca3b5d78ceb','قمصان','Shirts',null,1,'clothes'),
('80ae2630-6634-5e28-bd9e-82995e628072','a277259a-ec31-54fb-bada-cca3b5d78ceb','بناطيل','Trousers',null,2,'clothes'),
('1f07c3d3-8921-594a-960f-3c00f2323073','a277259a-ec31-54fb-bada-cca3b5d78ceb','جاكيتات','Jackets',null,3,'clothes'),
('855c8918-8721-51ab-be97-09b00f50f361','a277259a-ec31-54fb-bada-cca3b5d78ceb','ملابس داخلية','Underwear',null,4,'clothes'),
('e9d25b38-7e62-5d36-bb8e-cb6f212f9416','a277259a-ec31-54fb-bada-cca3b5d78ceb','بدل','Suits',null,5,'clothes'),
('c2f13de9-250f-5d38-ac58-e7d24181eba0',null,'ملابس حريمي','Women''s clothing',null,1,'clothes'),
('ed09e5a6-749a-5def-90f1-3c16b90e3e94','c2f13de9-250f-5d38-ac58-e7d24181eba0','فساتين','Dresses',null,0,'clothes'),
('0953fdf3-ef8b-5881-8dd8-071186b56810','c2f13de9-250f-5d38-ac58-e7d24181eba0','بلوزات','Blouses',null,1,'clothes'),
('273baa25-e830-5f84-87c1-c852a416a892','c2f13de9-250f-5d38-ac58-e7d24181eba0','بناطيل','Trousers',null,2,'clothes'),
('252974b1-b641-5666-8877-e56c6c65213c','c2f13de9-250f-5d38-ac58-e7d24181eba0','جيبات','Skirts',null,3,'clothes'),
('a038a640-a365-5011-a1fc-3c01e12c8113','c2f13de9-250f-5d38-ac58-e7d24181eba0','ملابس منزلية','Homewear',null,4,'clothes'),
('585ba6b8-741a-5867-a9dd-41a97f3f04c6','c2f13de9-250f-5d38-ac58-e7d24181eba0','حجاب وإيشاربات','Hijabs & scarves',null,5,'clothes'),
('bfa3823d-a7f8-5fdc-b47b-659b1d556785',null,'ملابس أطفال','Kids'' clothing',null,2,'kids'),
('1ee423e2-3134-5d82-8883-9c373620b691','bfa3823d-a7f8-5fdc-b47b-659b1d556785','ولادي','Boys',null,0,'kids'),
('31a9727d-59e5-5d54-8a81-ca69a89d1768','bfa3823d-a7f8-5fdc-b47b-659b1d556785','بناتي','Girls',null,1,'kids'),
('9f742d93-bcdc-5fdc-8921-3d0e25111606','bfa3823d-a7f8-5fdc-b47b-659b1d556785','رضع','Babies',null,2,'kids'),
('9e1b8518-5df2-51f3-9cf9-1f337d8878ab','bfa3823d-a7f8-5fdc-b47b-659b1d556785','مدرسي','School',null,3,'kids'),
('0e6e2c4e-2df5-5215-8531-7c2ef764c4a7',null,'أحذية','Shoes',null,3,'shoes'),
('0804d180-79a8-528d-ae45-e8f032e975c7','0e6e2c4e-2df5-5215-8531-7c2ef764c4a7','رجالي','Men',null,0,'shoes'),
('7cf3ce88-9d72-53da-927f-2e13221a1acf','0e6e2c4e-2df5-5215-8531-7c2ef764c4a7','حريمي','Women',null,1,'shoes'),
('644301e3-af51-5aad-90bc-9b67873d86d6','0e6e2c4e-2df5-5215-8531-7c2ef764c4a7','أطفال','Kids',null,2,'shoes'),
('6cbfea30-7cd2-5390-b30b-07d2ce138402',null,'كوتشيهات','Sneakers',null,4,'shoes'),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4',null,'شباشب','Slippers',null,5,'shoes'),
('3d6b6055-f692-5d8e-a2a3-49d4951c2269',null,'جلابيب','Galabiyas',null,6,'clothes'),
('fcbfe201-315b-5a1b-b4ce-d0d3018a7929','3d6b6055-f692-5d8e-a2a3-49d4951c2269','رجالي','Men',null,0,'clothes'),
('a4b0e768-40cb-57d4-bbef-e671c686e6e2','3d6b6055-f692-5d8e-a2a3-49d4951c2269','أطفال','Kids',null,1,'clothes'),
('eb33cbc0-f711-5f02-a640-d655b73be772','3d6b6055-f692-5d8e-a2a3-49d4951c2269','صيفي','Summer',null,2,'clothes'),
('7c8e9489-3e08-554c-a10c-61d6c1162e86','3d6b6055-f692-5d8e-a2a3-49d4951c2269','شتوي','Winter',null,3,'clothes'),
('931393f1-f194-5733-8323-6c1a56f80516',null,'عبايات','Abayas',null,7,'clothes'),
('2b154eaa-8ece-54dd-87cc-f8623a45647e','931393f1-f194-5733-8323-6c1a56f80516','سادة','Plain',null,0,'clothes'),
('ef20f301-a958-5bf5-a564-aea1ff099e98','931393f1-f194-5733-8323-6c1a56f80516','مطرزة','Embroidered',null,1,'clothes'),
('533a259d-8bdf-5962-a841-df5b96f7483e','931393f1-f194-5733-8323-6c1a56f80516','خليجي','Gulf style',null,2,'clothes'),
('3fbb3893-fb7a-5032-bb4d-f20d0639c446','931393f1-f194-5733-8323-6c1a56f80516','مصري','Egyptian style',null,3,'clothes'),
('b9b87a06-eb54-5210-8dac-9e64e5259be0',null,'العطور','Perfumes',null,8,'none'),
('a6ae68bb-1c2c-5239-90ea-b43ea5ba7086','b9b87a06-eb54-5210-8dac-9e64e5259be0','رجالي','Men',null,0,'none'),
('0eda13cf-3feb-54c4-b3f5-6a9644b63c7e','b9b87a06-eb54-5210-8dac-9e64e5259be0','حريمي','Women',null,1,'none'),
('0e02e862-9707-552a-bc62-61ead8fbb7f5','b9b87a06-eb54-5210-8dac-9e64e5259be0','يونيسكس','Unisex',null,2,'none'),
('04e04752-9d12-5477-b31a-5163bc1a29c3','b9b87a06-eb54-5210-8dac-9e64e5259be0','بخور وعود','Incense & oud',null,3,'none'),
('736a95ca-d315-564a-8e99-9c7189ccde43',null,'الإكسسوارات','Accessories',null,9,'none'),
('2d6c1d01-de48-5beb-8695-8906acc2f8ab','736a95ca-d315-564a-8e99-9c7189ccde43','ساعات','Watches',null,0,'none'),
('dcce8c5c-1bc0-5033-a5e8-24b57fb0c6a8','736a95ca-d315-564a-8e99-9c7189ccde43','حقائب','Bags',null,1,'none'),
('3df25b03-7107-5034-871e-ed12656c6a6c','736a95ca-d315-564a-8e99-9c7189ccde43','نظارات','Sunglasses',null,2,'none'),
('58f4f4e8-24fa-535c-b16e-82fa7e07e1a2','736a95ca-d315-564a-8e99-9c7189ccde43','محافظ','Wallets',null,3,'none'),
('fbf12667-7e5e-5a26-b729-4afe86f8d39a','736a95ca-d315-564a-8e99-9c7189ccde43','أحزمة','Belts',null,4,'none'),
('92c2a814-c15a-5d93-a68b-c18cb4b5c7ad','736a95ca-d315-564a-8e99-9c7189ccde43','مجوهرات','Jewelry',null,5,'none');

insert into public.products (category_id,name_ar,name_en,brand,sku,price,old_price,stock,is_featured,flash_price,flash_ends_at,sold_count,created_at,size_type,material_ar,gender,season,top_notes,middle_notes,base_notes,volume_ml,concentration) values
('3b35b1f0-f0b2-52b1-9859-219a86c2e469','تيشيرت قطن بياقة دائرية','Cotton crew-neck T-shirt','Basics','DEMO-01',249,320,33,true,199,now() + interval '5 days',170,now() - interval '9 days',null,'قطن 100%','men','summer',null,null,null,null,null),
('249c4f5d-24bc-526b-a70c-5b5f27b056ee','قميص أكسفورد كاجوال','Casual Oxford shirt','Concrete','DEMO-02',499,null,12,false,null,null,338,now() - interval '3 days',null,'قطن أكسفورد','men','all',null,null,null,null,null),
('80ae2630-6634-5e28-bd9e-82995e628072','بنطلون جينز سليم','Slim-fit jeans','Andora','DEMO-03',650,799,31,false,null,null,279,now() - interval '6 days',null,'دنيم قطن مع ليكرا','men','all',null,null,null,null,null),
('1f07c3d3-8921-594a-960f-3c00f2323073','جاكيت جلد صناعي','Faux leather jacket','Town Team','DEMO-04',1450,1800,40,true,1160,now() + interval '5 days',303,now() - interval '3 days',null,'جلد صناعي مبطن','men','winter',null,null,null,null,null),
('855c8918-8721-51ab-be97-09b00f50f361','طقم فانلة وبوكسر قطن','Cotton undershirt & boxer set','Cottonil','DEMO-05',185,null,13,false,null,null,114,now() - interval '2 days',null,'قطن مصري','men','all',null,null,null,null,null),
('e9d25b38-7e62-5d36-bb8e-cb6f212f9416','بدلة رجالي كلاسيك','Classic men''s suit','Diamond','DEMO-06',3900,4500,12,false,null,null,227,now() - interval '26 days',null,'صوف مخلوط','men','winter',null,null,null,null,null),
('ed09e5a6-749a-5def-90f1-3c16b90e3e94','فستان سواريه طويل','Long evening dress','Lavish','DEMO-07',1650,1990,35,true,1320,now() + interval '5 days',128,now() - interval '5 days',null,'شيفون مبطن','women','all',null,null,null,null,null),
('0953fdf3-ef8b-5881-8dd8-071186b56810','بلوزة ستان بكم طويل','Long-sleeve satin blouse','Defacto','DEMO-08',420,null,15,false,null,null,35,now() - interval '36 days',null,'ستان','women','all',null,null,null,null,null),
('273baa25-e830-5f84-87c1-c852a416a892','بنطلون واسع قماش','Wide-leg trousers','LC Waikiki','DEMO-09',480,560,11,false,null,null,119,now() - interval '40 days',null,'كريب','women','all',null,null,null,null,null),
('252974b1-b641-5666-8877-e56c6c65213c','جيبة بليسيه طويلة','Long pleated skirt','Defacto','DEMO-10',390,null,33,false,null,null,300,now() - interval '37 days',null,'بوليستر','women','all',null,null,null,null,null),
('a038a640-a365-5011-a1fc-3c01e12c8113','بيجامة قطن حريمي','Women''s cotton pajamas','Cottonil','DEMO-11',350,420,10,true,280,now() + interval '5 days',30,now() - interval '14 days',null,'قطن','women','summer',null,null,null,null,null),
('585ba6b8-741a-5867-a9dd-41a97f3f04c6','طرحة شيفون','Chiffon hijab','Basics','DEMO-12',120,null,26,false,null,null,290,now() - interval '8 days','none','شيفون','women','all',null,null,null,null,null),
('1ee423e2-3134-5d82-8883-9c373620b691','طقم ولادي تيشيرت وشورت','Boys T-shirt & shorts set','Baby Jo','DEMO-13',290,350,15,true,232,now() + interval '5 days',219,now() - interval '9 days',null,'قطن','kids','summer',null,null,null,null,null),
('31a9727d-59e5-5d54-8a81-ca69a89d1768','فستان بناتي مشجر','Girls floral dress','Baby Jo','DEMO-14',340,null,19,true,null,null,297,now() - interval '19 days',null,'قطن','kids','summer',null,null,null,null,null),
('9f742d93-bcdc-5fdc-8921-3d0e25111606','أوفرول رضع قطن','Baby cotton romper','Mothercare','DEMO-15',210,null,20,false,null,null,57,now() - interval '37 days',null,'قطن عضوي','kids','all',null,null,null,null,null),
('9e1b8518-5df2-51f3-9cf9-1f337d8878ab','قميص مدرسي أبيض','White school shirt','School Line','DEMO-16',180,null,12,false,null,null,195,now() - interval '6 days',null,'قطن بوليستر','kids','all',null,null,null,null,null),
('1ee423e2-3134-5d82-8883-9c373620b691','جاكيت ولادي شتوي','Boys winter jacket','Baby Jo','DEMO-17',590,690,21,false,null,null,293,now() - interval '3 days',null,'بوليستر مبطن','kids','winter',null,null,null,null,null),
('0804d180-79a8-528d-ae45-e8f032e975c7','حذاء أكسفورد جلد طبيعي','Leather Oxford shoes','Hamada Shoes','DEMO-18',1250,1500,35,false,null,null,259,now() - interval '34 days',null,'جلد طبيعي','men','all',null,null,null,null,null),
('7cf3ce88-9d72-53da-927f-2e13221a1acf','حذاء حريمي بكعب','Women''s heeled pumps','Shoe Room','DEMO-19',780,null,37,true,624,now() + interval '5 days',165,now() - interval '29 days',null,'جلد صناعي','women','all',null,null,null,null,null),
('644301e3-af51-5aad-90bc-9b67873d86d6','حذاء أطفال لاصق','Kids velcro shoes','Baby Jo','DEMO-20',320,null,23,false,null,null,190,now() - interval '19 days',null,'جلد صناعي','kids','all',null,null,null,null,null),
('0804d180-79a8-528d-ae45-e8f032e975c7','حذاء موكاسان','Suede moccasins','Hamada Shoes','DEMO-21',890,990,13,true,null,null,97,now() - interval '15 days',null,'شمواه','men','summer',null,null,null,null,null),
('7cf3ce88-9d72-53da-927f-2e13221a1acf','بوت حريمي شتوي','Women''s winter boots','Shoe Room','DEMO-22',1150,1350,39,false,null,null,299,now() - interval '19 days',null,'جلد صناعي مبطن','women','winter',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي أبيض كلاسيك','Classic white sneakers','Activ','DEMO-23',950,1100,26,true,760,now() + interval '5 days',180,now() - interval '28 days',null,'جلد صناعي','unisex','all',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي جري خفيف','Lightweight running shoes','Activ','DEMO-24',1290,null,15,false,null,null,316,now() - interval '4 days',null,'شبك قابل للتهوية','men','all',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي حريمي مريح','Women''s comfort sneakers','Activ','DEMO-25',880,990,18,false,null,null,267,now() - interval '26 days',null,'قماش','women','all',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي كانفاس','Canvas sneakers','Bata','DEMO-26',450,null,17,false,null,null,392,now() - interval '21 days',null,'كانفاس','unisex','summer',null,null,null,null,null),
('6cbfea30-7cd2-5390-b30b-07d2ce138402','كوتشي سلب أون','Slip-on sneakers','Bata','DEMO-27',520,620,10,false,null,null,255,now() - interval '26 days',null,'قماش مرن','unisex','all',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','شبشب منزلي فرو','Fur house slippers','Comfy','DEMO-28',160,null,28,true,null,null,347,now() - interval '4 days',null,'فرو صناعي','unisex','winter',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','صندل رجالي بأستك','Men''s strap sandals','Bata','DEMO-29',380,450,39,true,304,now() + interval '5 days',179,now() - interval '22 days',null,'نايلون ونعل مطاط','men','summer',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','شبشب بحر','Beach flip-flops','Comfy','DEMO-30',95,null,12,false,null,null,301,now() - interval '29 days',null,'مطاط','unisex','summer',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','شبشب جلد طبيعي','Leather slides','Hamada Shoes','DEMO-31',420,null,38,false,null,null,52,now() - interval '17 days',null,'جلد طبيعي','men','summer',null,null,null,null,null),
('f92c33fe-fa44-5dcd-afa3-6435c8deb0b4','شبشب حريمي مزين','Embellished women''s slides','Shoe Room','DEMO-32',260,310,11,false,null,null,361,now() - interval '4 days',null,'جلد صناعي','women','summer',null,null,null,null,null),
('fcbfe201-315b-5a1b-b4ce-d0d3018a7929','جلابية رجالي قطن مقلمة','Striped cotton galabiya','El Gabaly','DEMO-33',550,650,36,true,440,now() + interval '5 days',379,now() - interval '19 days',null,'قطن','men','summer',null,null,null,null,null),
('a4b0e768-40cb-57d4-bbef-e671c686e6e2','جلابية أطفال للعيد','Kids Eid galabiya','El Gabaly','DEMO-34',280,null,30,false,null,null,150,now() - interval '24 days','kids','قطن','kids','all',null,null,null,null,null),
('eb33cbc0-f711-5f02-a640-d655b73be772','جلابية كتان صيفي','Linen summer galabiya','El Gabaly','DEMO-35',620,null,30,true,null,null,16,now() - interval '29 days',null,'كتان','men','summer',null,null,null,null,null),
('7c8e9489-3e08-554c-a10c-61d6c1162e86','جلابية صوف شتوي','Wool winter galabiya','El Gabaly','DEMO-36',890,990,15,false,null,null,91,now() - interval '39 days',null,'صوف','men','winter',null,null,null,null,null),
('fcbfe201-315b-5a1b-b4ce-d0d3018a7929','جلابية سعودي بياقة','Saudi-style collared thobe','Al Haramain Thobes','DEMO-37',720,null,21,false,null,null,257,now() - interval '3 days',null,'بوليستر قطن','men','all',null,null,null,null,null),
('2b154eaa-8ece-54dd-87cc-f8623a45647e','عباية سادة كريب','Plain crepe abaya','Lamar','DEMO-38',690,null,16,false,null,null,398,now() - interval '18 days',null,'كريب','women','all',null,null,null,null,null),
('ef20f301-a958-5bf5-a564-aea1ff099e98','عباية مطرزة يدوي','Hand-embroidered abaya','Lamar','DEMO-39',1450,1750,33,true,1160,now() + interval '5 days',383,now() - interval '15 days',null,'كريب مطرز','women','all',null,null,null,null,null),
('533a259d-8bdf-5962-a841-df5b96f7483e','عباية خليجي مفتوحة','Open Gulf-style abaya','Dubai Line','DEMO-40',1200,null,13,false,null,null,205,now() - interval '31 days',null,'نيدا','women','all',null,null,null,null,null),
('3fbb3893-fb7a-5032-bb4d-f20d0639c446','عباية مصري بكم واسع','Egyptian wide-sleeve abaya','Lamar','DEMO-41',780,890,33,false,null,null,90,now() - interval '28 days',null,'كريب','women','all',null,null,null,null,null),
('ef20f301-a958-5bf5-a564-aea1ff099e98','عباية سواريه بالخرز','Beaded evening abaya','Dubai Line','DEMO-42',1890,null,16,true,null,null,286,now() - interval '17 days',null,'شيفون مطرز','women','all',null,null,null,null,null),
('a6ae68bb-1c2c-5239-90ea-b43ea5ba7086','عطر عود ملكي','Royal Oud','Maison','DEMO-43',950,1200,25,true,760,now() + interval '5 days',225,now() - interval '35 days','none',null,'men','all','برغموت، فلفل وردي','عود، ورد طائفي','عنبر، مسك، خشب الصندل',100,'EDP'),
('0eda13cf-3feb-54c4-b3f5-6a9644b63c7e','عطر زهور الياسمين','Jasmine Bloom','Maison','DEMO-44',780,null,30,false,null,null,366,now() - interval '26 days','none',null,'women','all','كمثرى، ليمون','ياسمين، زنبق','فانيليا، مسك أبيض',75,'EDP'),
('0e02e862-9707-552a-bc62-61ead8fbb7f5','عطر عنبر نوار','Amber Noir','Arabian Oud','DEMO-45',1100,null,22,false,null,null,354,now() - interval '24 days','none',null,'unisex','winter','زعفران','عنبر، لبان','باتشولي، جلد',100,'Parfum'),
('a6ae68bb-1c2c-5239-90ea-b43ea5ba7086','عطر فريش رياضي','Fresh Sport','Maison','DEMO-46',520,620,19,false,null,null,82,now() - interval '5 days','none',null,'men','summer','نعناع، جريب فروت','لافندر','أرز، مسك',100,'EDT'),
('04e04752-9d12-5477-b31a-5163bc1a29c3','بخور معمول فاخر','Premium bakhoor','Arabian Oud','DEMO-47',250,null,22,false,null,null,82,now() - interval '14 days','none',null,'unisex','all',null,null,null,null,null),
('0eda13cf-3feb-54c4-b3f5-6a9644b63c7e','عطر ورد الطائف','Taif Rose','Arabian Oud','DEMO-48',890,990,19,false,null,null,11,now() - interval '31 days','none',null,'women','all','ورد، ليتشي','ورد طائفي، فاوانيا','عود ناعم، مسك',50,'Parfum'),
('2d6c1d01-de48-5beb-8695-8906acc2f8ab','ساعة كلاسيك جلد','Classic leather watch','Q&Q','DEMO-49',1350,1600,8,true,1080,now() + interval '5 days',139,now() - interval '18 days','none','ستانلس ستيل وجلد','men','all',null,null,null,null,null),
('dcce8c5c-1bc0-5033-a5e8-24b57fb0c6a8','شنطة يد جلد','Leather handbag','Lamar Bags','DEMO-50',1250,null,31,false,null,null,79,now() - interval '26 days','none','جلد صناعي فاخر','women','all',null,null,null,null,null),
('3df25b03-7107-5034-871e-ed12656c6a6c','نظارة شمس بولارايزد','Polarized sunglasses','Vision','DEMO-51',450,550,28,false,null,null,317,now() - interval '36 days','none','إطار أسيتات','unisex','summer',null,null,null,null,null),
('58f4f4e8-24fa-535c-b16e-82fa7e07e1a2','محفظة رجالي جلد طبيعي','Genuine leather wallet','Hamada Leather','DEMO-52',320,null,11,false,null,null,69,now() - interval '32 days','none','جلد طبيعي','men','all',null,null,null,null,null),
('fbf12667-7e5e-5a26-b729-4afe86f8d39a','حزام جلد بإبزيم','Leather belt','Hamada Leather','DEMO-53',280,null,33,false,null,null,238,now() - interval '35 days','none','جلد طبيعي','men','all',null,null,null,null,null),
('92c2a814-c15a-5d93-a68b-c18cb4b5c7ad','سلسلة فضة بحرف','Silver initial necklace','Silver Line','DEMO-54',390,450,33,false,null,null,208,now() - interval '25 days','none','فضة عيار 925','women','all',null,null,null,null,null);

with colors(en,ar,hex) as (values ('black','أسود','#111111'),('white','أبيض','#f5f5f5'),('navy','كحلي','#1f2a44'),('beige','بيج','#d8c3a5'),('gray','رمادي','#8a8a8a'),('red','أحمر','#b3261e'),('olive','زيتي','#6b7046'),('brown','بني','#6d4c41'),('pink','وردي','#e8a0b4'),('blue','أزرق','#2f6fb5'),('gold','ذهبي','#c8a24a')),
spec(sku,colors,sizes) as (values
('DEMO-01',array['white','black','navy','olive']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('DEMO-02',array['blue','white']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('DEMO-03',array['navy','black']::text[],array['M','L','XL','XXL']::text[]),
('DEMO-04',array['black','brown']::text[],array['M','L','XL','XXL']::text[]),
('DEMO-05',array['white','gray']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('DEMO-06',array['navy','gray','black']::text[],array['M','L','XL','XXL']::text[]),
('DEMO-07',array['navy','red','black']::text[],array['S','M','L','XL']::text[]),
('DEMO-08',array['beige','white','pink']::text[],array['S','M','L','XL','XXL']::text[]),
('DEMO-09',array['black','beige']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('DEMO-10',array['olive','navy','beige']::text[],array['S','M','L','XL']::text[]),
('DEMO-11',array['pink','blue']::text[],array['S','M','L','XL','XXL','XXXL']::text[]),
('DEMO-12',array['black','beige','navy','pink']::text[],array[]::text[]),
('DEMO-13',array['blue','olive']::text[],array['2-3y','3-4y','4-5y','5-6y','6-7y']::text[]),
('DEMO-14',array['pink','white']::text[],array['2-3y','3-4y','4-5y','5-6y','6-7y','7-8y']::text[]),
('DEMO-15',array['white','blue','pink']::text[],array['0-3m','3-6m','6-12m','1-2y']::text[]),
('DEMO-16',array['white','blue']::text[],array['6-7y','7-8y','8-10y','10-12y','12-14y']::text[]),
('DEMO-17',array['navy','red']::text[],array['4-5y','5-6y','6-7y','7-8y','8-10y']::text[]),
('DEMO-18',array['brown','black']::text[],array['40','41','42','43','44','45']::text[]),
('DEMO-19',array['black','beige','red']::text[],array['36','37','38','39','40']::text[]),
('DEMO-20',array['blue','pink']::text[],array['36','37','38']::text[]),
('DEMO-21',array['brown','navy']::text[],array['40','41','42','43','44']::text[]),
('DEMO-22',array['black','brown']::text[],array['37','38','39','40','41']::text[]),
('DEMO-23',array['white','black']::text[],array['38','39','40','41','42','43','44']::text[]),
('DEMO-24',array['gray','navy','black']::text[],array['40','41','42','43','44','45']::text[]),
('DEMO-25',array['pink','white']::text[],array['36','37','38','39','40']::text[]),
('DEMO-26',array['navy','red','white']::text[],array['38','39','40','41','42','43']::text[]),
('DEMO-27',array['black','beige']::text[],array['39','40','41','42','43','44']::text[]),
('DEMO-28',array['beige','gray','pink']::text[],array['37','38','39','40','41','42']::text[]),
('DEMO-29',array['olive','black']::text[],array['40','41','42','43','44']::text[]),
('DEMO-30',array['blue','red','black']::text[],array['38','39','40','41','42','43']::text[]),
('DEMO-31',array['brown','black']::text[],array['40','41','42','43','44']::text[]),
('DEMO-32',array['gold','black']::text[],array['36','37','38','39','40']::text[]),
('DEMO-33',array['white','beige']::text[],array['L','XL','XXL','XXXL']::text[]),
('DEMO-34',array['white','navy']::text[],array['1-2y','2-3y','3-4y','4-5y','5-6y','6-7y','7-8y','8-10y','10-12y','12-14y']::text[]),
('DEMO-35',array['beige','white','blue']::text[],array['M','L','XL','XXL']::text[]),
('DEMO-36',array['gray','brown','navy']::text[],array['L','XL','XXL','XXXL']::text[]),
('DEMO-37',array['white']::text[],array['M','L','XL','XXL','XXXL']::text[]),
('DEMO-38',array['black','navy']::text[],array['S','M','L','XL']::text[]),
('DEMO-39',array['black']::text[],array['M','L','XL','XXL']::text[]),
('DEMO-40',array['black','beige']::text[],array['S','M','L','XL']::text[]),
('DEMO-41',array['black','brown']::text[],array['M','L','XL','XXL']::text[]),
('DEMO-42',array['black','navy']::text[],array['S','M','L','XL']::text[]),
('DEMO-49',array['brown','black']::text[],array[]::text[]),
('DEMO-50',array['brown','black','beige']::text[],array[]::text[]),
('DEMO-51',array['black','brown']::text[],array[]::text[]),
('DEMO-52',array['brown','black']::text[],array[]::text[]),
('DEMO-53',array['brown','black']::text[],array[]::text[]),
('DEMO-54',array['gold','gray']::text[],array[]::text[])),
rows as (
  select p.id pid, p.sku, c.en, c.ar, c.hex, c.ord, s.sz, coalesce(s.ord,1) sord
  from spec x join public.products p on p.sku = x.sku
  cross join lateral (select cc.*, u.ord from unnest(x.colors) with ordinality u(en,ord) join colors cc on cc.en = u.en) c
  left join lateral unnest(case when cardinality(x.sizes)=0 then array[null::text] else x.sizes end) with ordinality s(sz,ord) on true
)
insert into public.product_variants (product_id,name_ar,name_en,size,color_ar,color_en,color_hex,sku,stock,sort_order)
select pid, concat_ws(' / ', sz, ar), concat_ws(' / ', sz, initcap(en)), sz, ar, initcap(en), hex,
  sku || '-' || upper(left(en,3)) || coalesce('-' || sz, ''),
  case when abs(hashtext(sku||en||coalesce(sz,''))) % 100 < 12 then 0
       when abs(hashtext(sku||en||coalesce(sz,''))) % 100 < 30 then 1 + abs(hashtext(en||sku)) % 3
       else 5 + abs(hashtext(coalesce(sz,'')||sku||en)) % 20 end,
  ord*100 + sord
from rows;

insert into public.coupons (code, discount_type, value, min_order, max_discount)
values ('DEMO10', 'percent', 10, 150, 50) on conflict (code) do nothing;

-- Category profiles for the demo departments (subcategories inherit).
update public.categories set profile = case id
  when 'a277259a-ec31-54fb-bada-cca3b5d78ceb' then 'clothes'      -- Men's clothing
  when 'c2f13de9-250f-5d38-ac58-e7d24181eba0' then 'clothes'      -- Women's clothing
  when 'bfa3823d-a7f8-5fdc-b47b-659b1d556785' then 'kids'         -- Kids
  when '0e6e2c4e-2df5-5215-8531-7c2ef764c4a7' then 'shoes'        -- Shoes
  when '6cbfea30-7cd2-5390-b30b-07d2ce138402' then 'shoes'        -- Sneakers
  when 'f92c33fe-fa44-5dcd-afa3-6435c8deb0b4' then 'shoes'        -- Slippers
  when '3d6b6055-f692-5d8e-a2a3-49d4951c2269' then 'modest'       -- Galabiyas
  when '931393f1-f194-5733-8323-6c1a56f80516' then 'modest'       -- Abayas
  when 'b9b87a06-eb54-5210-8dac-9e64e5259be0' then 'perfume'      -- Perfumes
  when '736a95ca-d315-564a-8e99-9c7189ccde43' then 'accessories'  -- Accessories
  else profile end
 where parent_id is null;
