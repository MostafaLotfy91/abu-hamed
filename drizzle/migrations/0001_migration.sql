
-- Generic sample data (Arabic). Safe to edit/delete per client.
insert into public.store_settings (id, name_ar, name_en, tagline_ar, tagline_en, contact_phone, whatsapp_number, delivery_fee, free_delivery_threshold, min_order_amount, social_links)
values (1, 'سوق الحي', 'Neighborhood Market', 'كل احتياجات بيتك توصلك لحد الباب', 'Everything your home needs, delivered', '+201000000000', '201000000000', 25, 500, 100, '{"facebook":"","instagram":""}')
on conflict (id) do nothing;

insert into public.categories (id, name_ar, name_en, image_url, sort_order) values
 ('11111111-0000-0000-0000-000000000001','خضروات وفواكه','Fruits & Vegetables','/seed/produce.jpg',1),
 ('11111111-0000-0000-0000-000000000002','ألبان وبيض','Dairy & Eggs','/seed/dairy.jpg',2),
 ('11111111-0000-0000-0000-000000000003','مخبوزات','Bakery','/seed/bakery.jpg',3),
 ('11111111-0000-0000-0000-000000000004','مشروبات','Beverages','/seed/drinks.jpg',4),
 ('11111111-0000-0000-0000-000000000005','لحوم ودواجن','Meat & Poultry','/seed/meat.jpg',5),
 ('11111111-0000-0000-0000-000000000006','منظفات','Cleaning','/seed/cleaning.jpg',6);
insert into public.categories (id, parent_id, name_ar, name_en, image_url, sort_order) values
 ('11111111-0000-0000-0000-000000000011','11111111-0000-0000-0000-000000000001','خضروات','Vegetables','/seed/produce.jpg',1),
 ('11111111-0000-0000-0000-000000000012','11111111-0000-0000-0000-000000000001','فواكه','Fruits','/seed/produce.jpg',2);

insert into public.products (category_id, name_ar, name_en, description_ar, brand, price, old_price, unit, step, min_qty, stock, images, is_featured, flash_price, flash_ends_at, sold_count, created_at) values
 ('11111111-0000-0000-0000-000000000011','طماطم بلدي','Local Tomatoes','طماطم طازجة يومياً من المزرعة','المزرعة',18,22,'kg',0.5,0.5,200,'{/seed/produce.jpg}',true,15,now()+interval '2 days',120,now()-interval '20 days'),
 ('11111111-0000-0000-0000-000000000011','خيار','Cucumber','خيار طازج مقرمش','المزرعة',15,null,'kg',0.5,0.5,150,'{/seed/produce.jpg}',false,null,null,90,now()-interval '18 days'),
 ('11111111-0000-0000-0000-000000000011','بطاطس','Potatoes','بطاطس مناسبة للقلي والطهي','المزرعة',12,null,'kg',0.5,1,300,'{/seed/produce.jpg}',false,null,null,150,now()-interval '15 days'),
 ('11111111-0000-0000-0000-000000000012','موز','Bananas','موز ناضج وحلو','الحقول',28,32,'kg',0.5,0.5,120,'{/seed/produce.jpg}',true,null,null,80,now()-interval '3 days'),
 ('11111111-0000-0000-0000-000000000012','تفاح أحمر','Red Apples','تفاح أحمر مستورد','الحقول',65,75,'kg',0.5,0.5,80,'{/seed/produce.jpg}',false,55,now()+interval '1 day',60,now()-interval '2 days'),
 ('11111111-0000-0000-0000-000000000012','برتقال','Oranges','برتقال عصير','الحقول',20,null,'kg',1,1,0,'{/seed/produce.jpg}',false,null,null,40,now()-interval '10 days'),
 ('11111111-0000-0000-0000-000000000002','لبن كامل الدسم ١ لتر','Full Cream Milk 1L','لبن بقري طازج كامل الدسم','ألبان النيل',38,null,'piece',1,1,100,'{/seed/dairy.jpg}',true,null,null,200,now()-interval '25 days'),
 ('11111111-0000-0000-0000-000000000002','جبنة رومي','Roumy Cheese','جبنة رومي معتقة','ألبان النيل',240,280,'kg',0.25,0.25,40,'{/seed/dairy.jpg}',false,210,now()+interval '3 days',35,now()-interval '1 day'),
 ('11111111-0000-0000-0000-000000000002','زبادي طبيعي','Plain Yogurt','زبادي طبيعي ١٠٥ جم','ألبان النيل',8,null,'piece',1,1,300,'{/seed/dairy.jpg}',false,null,null,170,now()-interval '12 days'),
 ('11111111-0000-0000-0000-000000000002','بيض أبيض ٣٠ بيضة','White Eggs 30 pcs','كرتونة بيض أبيض طازج','مزارع الخير',165,180,'pack',1,1,60,'{/seed/dairy.jpg}',true,null,null,140,now()-interval '8 days'),
 ('11111111-0000-0000-0000-000000000003','عيش بلدي','Baladi Bread','٥ أرغفة عيش بلدي طازج','مخبز الحي',10,null,'pack',1,1,200,'{/seed/bakery.jpg}',false,null,null,300,now()-interval '30 days'),
 ('11111111-0000-0000-0000-000000000003','كرواسون زبدة','Butter Croissant','كرواسون فرنسي بالزبدة','مخبز الحي',22,null,'piece',1,1,50,'{/seed/bakery.jpg}',false,null,null,45,now()-interval '1 day'),
 ('11111111-0000-0000-0000-000000000003','عيش توست','Toast Bread','عيش توست أبيض ٦٠٠ جم','مخبز الحي',35,40,'piece',1,1,70,'{/seed/bakery.jpg}',false,null,null,75,now()-interval '6 days'),
 ('11111111-0000-0000-0000-000000000004','مياه معدنية ١.٥ لتر','Mineral Water 1.5L','مياه طبيعية معبأة','نبع',8,null,'piece',1,1,500,'{/seed/drinks.jpg}',false,null,null,400,now()-interval '28 days'),
 ('11111111-0000-0000-0000-000000000004','عصير برتقال ١ لتر','Orange Juice 1L','عصير برتقال طبيعي ١٠٠٪','نبع',45,55,'piece',1,1,90,'{/seed/drinks.jpg}',true,39,now()+interval '2 days',85,now()-interval '4 days'),
 ('11111111-0000-0000-0000-000000000004','مشروب غازي علبة','Soft Drink Can','مشروب غازي ٣٣٠ مل','نبع',15,null,'piece',1,1,250,'{/seed/drinks.jpg}',false,null,null,220,now()-interval '14 days'),
 ('11111111-0000-0000-0000-000000000005','صدور دجاج','Chicken Breast','صدور دجاج طازجة بدون عظم','دواجن الوادي',190,210,'kg',0.5,0.5,60,'{/seed/meat.jpg}',true,null,null,95,now()-interval '5 days'),
 ('11111111-0000-0000-0000-000000000005','لحم بقري مفروم','Minced Beef','لحم بقري طازج مفروم','جزارة الحي',420,null,'kg',0.25,0.25,40,'{/seed/meat.jpg}',false,null,null,70,now()-interval '9 days'),
 ('11111111-0000-0000-0000-000000000006','سائل غسيل أطباق','Dishwashing Liquid','سائل غسيل أطباق برائحة الليمون','نظيف',55,65,'piece',1,1,100,'{/seed/cleaning.jpg}',false,null,null,50,now()-interval '11 days'),
 ('11111111-0000-0000-0000-000000000006','منظف أرضيات','Floor Cleaner','منظف أرضيات ٣ لتر','نظيف',95,null,'piece',1,1,45,'{/seed/cleaning.jpg}',false,null,null,30,now()-interval '7 days');

-- example variants
insert into public.product_variants (product_id, name_ar, name_en, attributes, price, stock, sort_order)
select id, 'صغير ٥٠٠ مل', 'Small 500ml', '{"size":"500ml"}', 30, 50, 1 from public.products where name_en = 'Dishwashing Liquid';
insert into public.product_variants (product_id, name_ar, name_en, attributes, price, stock, sort_order)
select id, 'كبير ١ لتر', 'Large 1L', '{"size":"1L"}', 55, 50, 2 from public.products where name_en = 'Dishwashing Liquid';

insert into public.banners (image_url, title_ar, title_en, subtitle_ar, subtitle_en, link, sort_order) values
 ('/seed/banner-1.jpg','خصومات الأسبوع','Weekly Deals','وفر لحد ٣٠٪ على الخضار والفاكهة','Save up to 30% on fresh produce','/category/11111111-0000-0000-0000-000000000001',1),
 ('/seed/banner-2.jpg','توصيل لحد باب البيت','Delivered to your door','اطلب دلوقتي ووصلك في أقل من ساعة','Order now, arrives within the hour','/products',2);

insert into public.branches (name_ar, name_en, address_ar, address_en, phone) values
 ('الفرع الرئيسي','Main Branch','شارع الجمهورية','Republic St.','+201000000000');

insert into public.coupons (code, discount_type, value, min_order, max_discount) values ('WELCOME10','percent',10,150,50);
