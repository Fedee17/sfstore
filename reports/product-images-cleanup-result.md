# Product image legacy cleanup - Phase 4B

Status: **SUCCESS**. Approved cleanup completed; no business data changed.

## Versioned evidence

- Cleanup hardening: `0484be76640185b08bbb4377fe6d79099db2d6b9`.
- PRE/BLOCKED evidence: `ed21539d5b96969aab5336c7348c9462324fe4a5`.
- Approved plan SHA-256: `a8bbc59b25346376697c1218d047d5601affbcc93b0250a4b44a47e2e407c1db` (unchanged).
- Immediate PRE: 2026-10-05T14:22:52.824Z.
- Immediate POST: 2026-10-05T14:32:44.364Z.
- No-op verification: 2026-10-05T14:34:24.195Z.
- Previous BLOCKED result is preserved in Git; original PRE report remains unchanged.

## Before / after

| Entity | Before | After |
| --- | ---: | ---: |
| product_images | 84 | 57 |
| Storage objects | 85 | 57 |
| products | 179 | 179 |

Apply exited 0. Exactly 27 DELETE_BOTH and 1 DELETE_STORAGE completed: 27 metadata rows and 28 objects deleted, including 1 orphan. No abort or cleanup error.

## Affected products

| Product | Keeper row | DB rows | Objects | Primary | sort_order | HTTP |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| Al Haramain dubai night | e1f8f6e1-fc81-4147-8034-c2e6c9742a38 | 1 | 1 | true | 0 | 200 |
| Rasasi Hawas For Him | 53912094-c090-46b7-ad2d-46ac81bde040 | 1 | 1 | true | 0 | 200 |
| Lattafa Yara Tous | fcfb0556-e18c-460c-81e3-94f95bb3572f | 1 | 1 | true | 0 | 200 |

## Protected REVIEW

- `f1cb2323-0e7f-49d6-a26f-110595c90e55`, slug `lattafa-yara-rosa`: row `8a698d0f-96a5-4af8-bb05-4de4168bf431` and Storage object unchanged; HTTP 200.
- `05b34469-3eb8-4148-8e97-9a19f1c2df6e`, slug `perfume-yara-rosa`: row `216c5fa1-8fa8-49ec-bfbc-7091a9139045` and Storage object unchanged; HTTP 200.

No identity decision was made for either Yara Rosa. Both remain REVIEW.

## Integrity

- DB orphan rows: 0.
- Storage orphan objects: 0.
- Multiple primary: 0.
- Products with images but no primary: 0.
- Duplicate sort_order: 0.
- sort_order gaps: 0.
- Broken URLs: 0; all 57 remaining images responded HTTP 200 (HEAD).
- All 55 KEEP rows and both REVIEW rows are unchanged, including timestamps.
- All remaining Storage objects preserve their ID, timestamps, eTag, size and MIME.

## Business invariants

Canonical SHA-256 compares every column, with rows ordered by id and object keys sorted. All hashes match the immediate PRE; stock, prices, costs, status, operations and history were not modified.

| Table | Count | PRE / POST | SHA-256 |
| --- | ---: | --- | --- |
| products | 179 | unchanged | `c2c5de94aa45be3042ead227ce5f46e8552952dc2c58e5d79b517ab33528e036` |
| inventory_movements | 21 | unchanged | `3ec14921e4cc1c82d54d733015b8e55144ba5b429bb993dbf129bfc1aec2bd91` |
| orders | 132 | unchanged | `b79d53e63b8b8e30fadb9a9301237d228c4c49d339320337b669b076bbd9407d` |
| order_items | 135 | unchanged | `df5bd43b12cdb71b3ed0854e532c396600f5f41bdd6fcde299e665af8d3a4131` |
| order_payments | 131 | unchanged | `cf6de47984733cf5a5bfc1c5d1dd0a38d83fde8804d336df8e5fa258cb809f3c` |
| purchases | 182 | unchanged | `b36813000dca5595425b13ed5ef145e8530a3c5dff295f34288f3a42e5d4627e` |
| purchase_items | 185 | unchanged | `942faa740db0bca943ea754a869fba21d7ab4803a7f7a12b712764fee58171a5` |
| historical_import_batches | 1 | unchanged | `1bf57179ddd55903b2dd2e2eb2ac6b92bdd3f5f531c88fbad052d9c0ae6f33fe` |
| historical_import_records | 309 | unchanged | `300f0b16228af0000caae699ba170516a903f8c5d11bab2970f709b446dd7c26` |

## POST dry-run and idempotence

```text
Estado: POST-CLEANUP
KEEP: 55
DELETE_BOTH: 0
DELETE_STORAGE: 0
REVIEW: 2
writes proposed = 0
```

Second --apply exited 0 as a safe NO-OP; writes performed: 0. A fresh read confirmed identical rows, objects and business invariants afterwards.

## Deleted metadata rows

| Row id | Product id | Storage path |
| --- | --- | --- |
| 15be8cd0-e2bc-4085-9cb3-db42a9024219 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227745703-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 1a484d95-4ee9-414e-af15-a0cf11cbbd1b | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227804244-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 1afb8b59-23c2-4da9-9a1b-9cf7ccc2a527 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227695603-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 1b39d7e0-8c67-45b2-bf50-88c1697611d1 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227734435-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 23e4c7d7-08fe-427f-b3ec-7625d081d9c2 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227762120-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 2b4bf44e-e108-4849-9acb-0f6970a313ab | 880dfa55-41c2-4275-91e7-ca7def54ec14 | products/880dfa55-41c2-4275-91e7-ca7def54ec14/1780978863318-img-4898-optimizada.webp |
| 33764964-8c9f-444d-a93a-1d127173b1ab | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227786662-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 49437a22-4271-4f5c-9aae-0942a7e5b698 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227821526-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 4ad16a75-ef19-486b-ae9c-62fb904ca31d | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227810573-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 509d6c9e-0d19-411f-b364-ca15a374e8fd | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227715355-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 57e579f2-1fd3-4915-9fc3-7e7c90a27c7a | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227725352-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 663a1a46-905c-4edb-9203-8243a92b4ea4 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227699441-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 6c27a1ff-ab67-49a6-a227-aed5579710b9 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227791054-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 6d8a1d1d-7283-4ffe-8255-59fbe9f9d310 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227753858-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 8837eafc-4118-4b1b-a10b-e6d71789f9be | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227742607-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 95686343-4c85-4394-a819-8c2273d2284b | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227769712-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 98d749f3-1b20-4df8-a783-ff97e6a3056f | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227806735-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 9cc02b87-2304-4636-b4be-e785906e2a5d | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227684865-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| 9ff89b89-e76f-4166-bca3-24c821f5312f | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227756859-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| b6a4f02b-34e0-456e-b1c5-5086fa7b6fc0 | e53066cc-9c35-47e2-8d27-0fe5fb425ce8 | products/e53066cc-9c35-47e2-8d27-0fe5fb425ce8/1781366634997-img-4923-optimizada.webp |
| c0d762e5-549a-4072-94d2-6787e6fef37a | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227779302-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| c78d5db8-21f2-454f-9ceb-ad4bcfa547a1 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227738188-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| c86c3610-e101-472e-8509-45fb379bbea6 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227813740-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| de4e092a-24ea-4b86-9819-ea3fcc8dae32 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227782736-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| e11477e0-8584-4f4c-98fe-dd213aadaa83 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227793492-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| e188e3d0-4cf7-4c98-861d-2e23446ce8a1 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227766996-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |
| e1dd3fc4-586e-4618-aea8-ca96307ebdc8 | 66c152aa-98db-4827-b4c7-fdc2721da2a6 | products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227800191-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp |

Orphan removed: `products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227660446-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp`; eTag `a8c1635ac5153f08c7286c9fea8a3ca4`, 50728 bytes, image/webp.

Complete before/after snapshots and all 28 deleted objects are recorded in product-images-cleanup-result.json.

## Preserved content fingerprints

| Path | eTag | Size | MIME |
| --- | --- | ---: | --- |
| products/032d8b00-dd7e-4700-b8d4-106ccf93ba1a/1781480545296-img-0438-optimizada.webp | 705db25b706247b63b9c65d69897133e | 41044 | image/webp |
| products/05b34469-3eb8-4148-8e97-9a19f1c2df6e/1781366716520-img-4921-optimizada.webp | 124bacd2b763d1c5307bd23f201186d5 | 69834 | image/webp |
| products/06d245a5-6028-42dd-89d8-1e1f1b598faf/1781481057349-img-0432-optimizada.webp | 980dc9a14b91f6421520d64269b4425e | 54504 | image/webp |
| products/0be4f17b-4888-466f-ad13-3643a645f730/1781483499083-img-0193-optimizada.webp | a0ede90d44b4972b787e44b8914b4bb1 | 41794 | image/webp |
| products/1354e3bc-2fa3-486d-a43a-d38da696f160/1781367460584-73bb2879-ccf0-4a17-a038-02154486843e-optimizada.webp | 16cc22b23f47f7d1eb0b2f910485d368 | 85710 | image/webp |
| products/13627ebe-ca04-46e0-9d26-d2861d1ee4a5/1780979524128-img-0780-optimizada.webp | 6bcbbd494751cd83546ed00915d53cff | 57264 | image/webp |
| products/165c4d74-286a-4882-9370-e47001f85e95/1781480345115-img-0536-optimizada.webp | d86e0ca754dac2cb1a470117c5c57635 | 53604 | image/webp |
| products/19fba313-0653-4d9c-9e1a-f62a46652bf5/1781480512488-img-0436-optimizada.webp | 7e47623f9d6281cdf623fb143fcde276 | 55812 | image/webp |
| products/1a0e151a-fe10-4276-9b0e-a3db50759c41/1781367416969-img-4814-optimizada.webp | 806f40344692346d1d88bff924816dac | 61796 | image/webp |
| products/1dc53fdd-4eb8-4b60-b8ef-5eba96dc2cb2/1791041868693-0-img-1761-optimizada.webp | b215b4f14e42986a2509c4f8ea775139 | 53564 | image/webp |
| products/2c39e1c9-cc23-4d4c-bb5d-8469f87e666b/923966aa646c538e7b8d67a2c0ad6696-img-5784-optimizada.webp | 923966aa646c538e7b8d67a2c0ad6696 | 61634 | image/webp |
| products/2c39e1c9-cc23-4d4c-bb5d-8469f87e666b/ac923da68727068a24b4aa4b48f0b16d-img-0718-optimizada.webp | ac923da68727068a24b4aa4b48f0b16d | 53256 | image/webp |
| products/2c39e1c9-cc23-4d4c-bb5d-8469f87e666b/f79fe37f2d38749557a3f00f943868dc-img-5950-optimizada.webp | f79fe37f2d38749557a3f00f943868dc | 69580 | image/webp |
| products/2db67b25-6e37-446a-8e98-5f626d5efc63/1781484221250-img-0191-optimizada.webp | 2ec94f70f5bc3c6b7f5742e922475421 | 47988 | image/webp |
| products/2e51cf34-5c02-42ff-867e-7a06d8bf273b/1789248291969-0-img-9606-optimizada.webp | 524ea0d1cf9d3ec445a373c4a090b9ac | 51648 | image/webp |
| products/314ab75f-58b3-49c5-8602-cda72295d855/1789600945890-0-img-1206-optimizada.webp | 3ece0054dc9186b8280ddd3528b5b2f4 | 60626 | image/webp |
| products/39310ff1-8765-464b-89f2-cbb245581879/1781480971158-img-0433-optimizada.webp | 992c4f0353c770246419167e708e894c | 49704 | image/webp |
| products/3e52b75d-007c-4637-8ad7-3dd3a8efb159/1781483326400-img-0204-optimizada.webp | a65456491a53f2f583bfa10b1b03cd65 | 47494 | image/webp |
| products/41cec216-c896-452a-8e38-15730ebafa35/1781480941199-img-0434-optimizada.webp | 9a1fa7b0909206a0f3ece4c70e97f4a1 | 50262 | image/webp |
| products/4d7976ee-45ae-447a-88a7-e6f986c59d8f/1781480665871-img-7007-optimizada.webp | 89be27b002950ee7433123c6a24bea56 | 80550 | image/webp |
| products/5585ed23-1d19-40b0-a443-81953a999e9c/1781480195894-img-0538-optimizada.webp | a28f8974cc8fa77b8cb3c55d03d6a09b | 54244 | image/webp |
| products/631dc501-2496-4c4f-9900-b0b14fbd19d2/2283c3f9a52ddca980b74284862a3374-4e03dfa4-8dcf-4fdc-8c0a-c63730b0be8a-optimizada.webp | 2283c3f9a52ddca980b74284862a3374 | 56102 | image/webp |
| products/65027262-d36d-4230-a859-40a007489bfa/1781367352580-img-4875-optimizada.webp | fba29689eb9f11927528842eff9bb34c | 98212 | image/webp |
| products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227676837-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp | a8c1635ac5153f08c7286c9fea8a3ca4 | 50728 | image/webp |
| products/6ca63ce3-5694-418f-90a8-5d8043f4c2f5/1789601319065-0-37e6f25d-987d-4ebd-9f61-cb46a2aaf76f-optimizada.webp | 078bd3764d4d93b14b9bc1d00694716a | 48090 | image/webp |
| products/6d1059a4-9226-415a-ac5a-163b9545b04a/8b7f880268656bbf363332c0a686f9c0-img-5794-optimizada.webp | 8b7f880268656bbf363332c0a686f9c0 | 57824 | image/webp |
| products/7d2416cf-c123-4040-8617-1fb75de38e6e/be7eabe25fa6cdb03a7090c08817cc10-img-9606-optimizada.webp | be7eabe25fa6cdb03a7090c08817cc10 | 65840 | image/webp |
| products/880dfa55-41c2-4275-91e7-ca7def54ec14/1780978864680-img-4898-optimizada.webp | 0fc132872409cc133657335138562501 | 88116 | image/webp |
| products/8ca47237-b9ae-4720-a8be-043ecd104ed7/1781483034879-img-0211-optimizada.webp | 90fee71fd09242048043ff101326a7d5 | 46910 | image/webp |
| products/8d828391-4a86-4eb9-bb6a-f384bc3e1d7d/1781482003237-img-0207-optimizada.webp | 5954b3fbef6a0a336722fe09027a76e5 | 45996 | image/webp |
| products/8f06198a-0199-407d-9d5d-9e7c38bcd578/1781484545412-img-0210-optimizada.webp | 738f96ae466e2a0dc29475f6c1083625 | 47020 | image/webp |
| products/900a7c30-7412-4da3-b300-7d013044e853/1781367154390-whatsapp-image-2026-01-26-at-18-33-1-optimizada.webp | 4df2b7397794cafccff7727bb2c0222c | 55758 | image/webp |
| products/96f90d2b-185b-4f47-a155-184619a8b6e3/1780979127511-img-5811-optimizada.webp | f4c1866c12c97aedc7e5596f0640607c | 70074 | image/webp |
| products/9c07ceb2-4d7a-407c-898b-e0cb43fc008e/1780978967811-whatsapp-image-2026-01-26-at-18-33-15-optimizada.webp | 33f93ea906c424ea2aa5bc2a0b703976 | 41898 | image/webp |
| products/a2843178-0691-4a35-bb30-b475b3e941ff/1781480265866-img-0537-optimizada.webp | 2bef60a9b758eca76dcd1516bb0d1f85 | 62202 | image/webp |
| products/ac173fed-a2b0-43b9-9d05-36b7ebdcf902/1781481185498-img-0544-optimizada.webp | e0e76c0919be123887e587381210aac7 | 42376 | image/webp |
| products/ac79cfed-1855-4fc9-8bb2-de2fc01aa904/1781481867482-img-0531-optimizada.webp | dad7a5f13bc2d19bd3c7bf1002286df1 | 109558 | image/webp |
| products/ad228c7e-6279-424f-a436-36e85685e5b8/1789229590252-0-f085659f-287f-4727-8d85-8ffc710516d3-optimizada.webp | 3e10629eda8f82798a361afe1599ad41 | 51010 | image/webp |
| products/b223e3e9-3bb6-4da9-8a62-a03a4fd994e0/1781480153667-img-0541-optimizada.webp | 38a018bef3be811693c47e07ab69517f | 54046 | image/webp |
| products/b58d9866-5d03-4f63-994d-762108522492/1781367271058-whatsapp-image-2026-01-26-at-18-33-16-optimizada.webp | 8d8939ef4220b3b04ed518dcd5369a67 | 59854 | image/webp |
| products/b6db64db-4768-43f9-aadd-e72f24d6d318/1781482234001-img-0203-optimizada.webp | 8521ff63faf81ae87ba0e1582c0ca35d | 45064 | image/webp |
| products/bd7930a6-65c3-4e3b-b85f-1cb1b56d6835/1780890845250-img-4815-optimizada.webp | 0394b2d4b4150f8f57f8c2fb347733c4 | 34768 | image/webp |
| products/be8852f0-c712-4b69-993f-dfd6e954af31/1781480065580-img-0545-optimizada.webp | 53adb83f21cadd272579161c7410686a | 42190 | image/webp |
| products/bedb3ca2-68ed-4158-a00f-4b203b4d8f92/904022a6da1fb96a0d70269d0263a39c-img-9603-optimizada.webp | 904022a6da1fb96a0d70269d0263a39c | 60898 | image/webp |
| products/c6ab646e-ea3c-4ca9-928a-3f518e49f5e6/1790812472459-0-img-0779-optimizada.webp | 21fca3f0d5407aff224aa7a5cf07305d | 22414 | image/webp |
| products/d6d024ff-1804-4be5-838b-8f7af9ca363d/1781481032442-img-0431-optimizada.webp | ba0b1371fb545a379ca52d65cd0996e2 | 52136 | image/webp |
| products/da8d3743-3ee5-4210-a387-49e4f87e9ec9/1781481332257-img-0535-optimizada.webp | 01f960a23603e88dae18b2b789509d77 | 67668 | image/webp |
| products/e53066cc-9c35-47e2-8d27-0fe5fb425ce8/1781366636539-img-4923-optimizada.webp | 7c726d805187c4fc0e3f7e4323dad654 | 68662 | image/webp |
| products/e53a64ad-8e1d-452f-9025-53d940215082/1781480726821-img-7005-optimizada.webp | 7fa810098ef0c925abb18c2fbb9e8862 | 57302 | image/webp |
| products/e5b37a2f-ab84-4009-b8d3-1a6f307c3eda/1781483155525-img-0199-optimizada.webp | 0a9a67ff8f282dee39e86c2ec3ea1ca5 | 46304 | image/webp |
| products/e7ceb4e9-34e4-469b-b225-5de2e3cb5a8a/e259eae8f29745dbebb130e872b94199-8cb700fd-11fd-4efa-9a2e-8eee0d8267d4-optimizada.webp | e259eae8f29745dbebb130e872b94199 | 109994 | image/webp |
| products/edb4b664-5da6-489c-94c1-b0d1deb88232/1781481899287-img-0524-optimizada.webp | 51c746b57035fff4b4ac982883c011b0 | 214644 | image/webp |
| products/f1cb2323-0e7f-49d6-a26f-110595c90e55/1780979018845-img-4921-optimizada.webp | 124bacd2b763d1c5307bd23f201186d5 | 69834 | image/webp |
| products/f57365ec-33f2-4807-aa64-18a77c00b00b/1789599986328-0-img-9605-optimizada.webp | 3c9a39d85fa2468d30358d5eab141c8a | 46768 | image/webp |
| products/f91c4caa-32bb-4450-8a87-25422095257b/1781484098968-img-0206-optimizada.webp | 2b7a5b8eeb27c8f18dc085854ae64061 | 48806 | image/webp |
| products/fe29c305-f0f8-4752-855c-c785be1046ac/1781482275059-img-0197-optimizada.webp | 4fd933be81f60aed4eeab035c9713744 | 45638 | image/webp |
| products/ff56264b-c183-404b-984f-205e95eea65a/1781481004696-img-0439-optimizada.webp | 4edaa1c1e37db19e7d83493a1401342b | 51282 | image/webp |

## Validation

- Focused tests: 49/49 passed.
- Complete suite: 520/520 passed.
- TypeScript, modified-file ESLint, production build and git diff --check: PASS.
- Only pre-existing MODULE_TYPELESS_PACKAGE_JSON warnings. No cleanup errors.
- No manual deployment, schema change, new functional change, or modification of the approved plan.
